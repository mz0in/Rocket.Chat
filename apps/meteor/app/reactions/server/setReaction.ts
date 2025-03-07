import { Apps, AppEvents } from '@rocket.chat/apps';
import { api, Message } from '@rocket.chat/core-services';
import type { IMessage, IRoom, IUser } from '@rocket.chat/core-typings';
import type { ServerMethods } from '@rocket.chat/ddp-client';
import { Messages, EmojiCustom, Rooms, Users } from '@rocket.chat/models';
import { Meteor } from 'meteor/meteor';
import _ from 'underscore';

import { callbacks } from '../../../lib/callbacks';
import { i18n } from '../../../server/lib/i18n';
import { canAccessRoomAsync } from '../../authorization/server';
import { hasPermissionAsync } from '../../authorization/server/functions/hasPermission';
import { emoji } from '../../emoji/server';
import { isTheLastMessage } from '../../lib/server/functions/isTheLastMessage';
import { notifyOnRoomChangedById, notifyOnMessageChange } from '../../lib/server/lib/notifyListener';

const removeUserReaction = (message: IMessage, reaction: string, username: string) => {
	if (!message.reactions) {
		return message;
	}

	message.reactions[reaction].usernames.splice(message.reactions[reaction].usernames.indexOf(username), 1);
	if (message.reactions[reaction].usernames.length === 0) {
		delete message.reactions[reaction];
	}
	return message;
};

async function setReaction(room: IRoom, user: IUser, message: IMessage, reaction: string, shouldReact?: boolean) {
	reaction = `:${reaction.replace(/:/g, '')}:`;

	if (!emoji.list[reaction] && (await EmojiCustom.findByNameOrAlias(reaction, {}).count()) === 0) {
		throw new Meteor.Error('error-not-allowed', 'Invalid emoji provided.', {
			method: 'setReaction',
		});
	}

	if (room.ro === true && !room.reactWhenReadOnly && !(await hasPermissionAsync(user._id, 'post-readonly', room._id))) {
		// Unless the user was manually unmuted
		if (!(room.unmuted || []).includes(user.username as string)) {
			throw new Error("You can't send messages because the room is readonly.");
		}
	}

	if (Array.isArray(room.muted) && room.muted.indexOf(user.username as string) !== -1) {
		throw new Meteor.Error('error-not-allowed', i18n.t('You_have_been_muted', { lng: user.language }), {
			rid: room._id,
		});
	}

	// if (!('reactions' in message)) {
	// 	return;
	// }

	await Message.beforeReacted(message, room);

	const userAlreadyReacted =
		message.reactions &&
		Boolean(message.reactions[reaction]) &&
		message.reactions[reaction].usernames.indexOf(user.username as string) !== -1;
	// When shouldReact was not informed, toggle the reaction.
	if (shouldReact === undefined) {
		shouldReact = !userAlreadyReacted;
	}

	if (userAlreadyReacted === shouldReact) {
		return;
	}

	let isReacted;

	if (userAlreadyReacted) {
		const oldMessage = JSON.parse(JSON.stringify(message));
		removeUserReaction(message, reaction, user.username as string);
		if (_.isEmpty(message.reactions)) {
			delete message.reactions;
			if (isTheLastMessage(room, message)) {
				await Rooms.unsetReactionsInLastMessage(room._id);
				void notifyOnRoomChangedById(room._id);
			}
			await Messages.unsetReactions(message._id);
		} else {
			await Messages.setReactions(message._id, message.reactions);
			if (isTheLastMessage(room, message)) {
				await Rooms.setReactionsInLastMessage(room._id, message.reactions);
			}
		}
		await callbacks.run('unsetReaction', message._id, reaction);
		await callbacks.run('afterUnsetReaction', message, { user, reaction, shouldReact, oldMessage });

		isReacted = false;
	} else {
		if (!message.reactions) {
			message.reactions = {};
		}
		if (!message.reactions[reaction]) {
			message.reactions[reaction] = {
				usernames: [],
			};
		}
		message.reactions[reaction].usernames.push(user.username as string);
		await Messages.setReactions(message._id, message.reactions);
		if (isTheLastMessage(room, message)) {
			await Rooms.setReactionsInLastMessage(room._id, message.reactions);
			void notifyOnRoomChangedById(room._id);
		}
		await callbacks.run('setReaction', message._id, reaction);
		await callbacks.run('afterSetReaction', message, { user, reaction, shouldReact });

		isReacted = true;
	}

	await Apps.self?.triggerEvent(AppEvents.IPostMessageReacted, message, user, reaction, isReacted);

	void notifyOnMessageChange({
		id: message._id,
	});
}

export async function executeSetReaction(userId: string, reaction: string, messageId: IMessage['_id'], shouldReact?: boolean) {
	const user = await Users.findOneById(userId);

	if (!user) {
		throw new Meteor.Error('error-invalid-user', 'Invalid user', { method: 'setReaction' });
	}

	const message = await Messages.findOneById(messageId);
	if (!message) {
		throw new Meteor.Error('error-not-allowed', 'Not allowed', { method: 'setReaction' });
	}

	const room = await Rooms.findOneById(message.rid);
	if (!room) {
		throw new Meteor.Error('error-not-allowed', 'Not allowed', { method: 'setReaction' });
	}

	if (!(await canAccessRoomAsync(room, user))) {
		throw new Meteor.Error('not-authorized', 'Not Authorized', { method: 'setReaction' });
	}

	return setReaction(room, user, message, reaction, shouldReact);
}

declare module '@rocket.chat/ddp-client' {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	interface ServerMethods {
		setReaction(reaction: string, messageId: IMessage['_id'], shouldReact?: boolean): boolean | undefined;
	}
}

Meteor.methods<ServerMethods>({
	async setReaction(reaction, messageId, shouldReact) {
		const uid = Meteor.userId();
		if (!uid) {
			throw new Meteor.Error('error-invalid-user', 'Invalid user', { method: 'setReaction' });
		}

		try {
			await executeSetReaction(uid, reaction, messageId, shouldReact);
		} catch (e: any) {
			if (e.error === 'error-not-allowed' && e.reason && e.details && e.details.rid) {
				void api.broadcast('notify.ephemeralMessage', uid, e.details.rid, {
					msg: e.reason,
				});

				return false;
			}

			throw e;
		}
	},
});
