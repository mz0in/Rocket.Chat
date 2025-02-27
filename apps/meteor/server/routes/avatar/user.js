import { Avatars, Users } from '@rocket.chat/models';
import { serverFetch as fetch } from '@rocket.chat/server-fetch';

import { FileUpload } from '../../../app/file-upload/server';
import { settings } from '../../../app/settings/server';
import { renderSVGLetters, serveAvatar, wasFallbackModified, setCacheAndDispositionHeaders } from './utils';

const MAX_USER_SVG_AVATAR_SIZE = 1024;
const MIN_USER_SVG_AVATAR_SIZE = 16;

// request /avatar/@name forces returning the svg
export const userAvatar = async function (req, res) {
	const requestUsername = decodeURIComponent(req.url.substr(1).replace(/\?.*$/, ''));

	if (!requestUsername) {
		res.writeHead(404);
		res.end();
		return;
	}

	let avatarSize = req.query.size && parseInt(req.query.size);
	if (avatarSize) {
		avatarSize = Math.min(Math.max(avatarSize, MIN_USER_SVG_AVATAR_SIZE), MAX_USER_SVG_AVATAR_SIZE);
	}

	setCacheAndDispositionHeaders(req, res);

	// if request starts with @ always return the svg letters
	if (requestUsername[0] === '@') {
		const svg = renderSVGLetters(requestUsername.substr(1), avatarSize);
		serveAvatar(svg, req.query.format, res);
		return;
	}

	const reqModifiedHeader = req.headers['if-modified-since'];

	const file = await Avatars.findOneByName(requestUsername);
	if (file) {
		res.setHeader('Content-Security-Policy', "default-src 'none'");

		if (reqModifiedHeader && reqModifiedHeader === (file.uploadedAt && file.uploadedAt.toUTCString())) {
			res.setHeader('Last-Modified', reqModifiedHeader);
			res.writeHead(304);
			res.end();
			return;
		}

		res.setHeader('Last-Modified', file.uploadedAt.toUTCString());
		res.setHeader('Content-Type', file.type);
		res.setHeader('Content-Length', file.size);

		return FileUpload.get(file, req, res);
	}

	if (settings.get('Accounts_AvatarExternalProviderUrl')) {
		const response = await fetch(settings.get('Accounts_AvatarExternalProviderUrl').replace('{username}', requestUsername));
		response.headers.forEach((value, key) => res.setHeader(key, value));
		response.body.pipe(res);
		return;
	}

	// if still using "letters fallback"
	if (!wasFallbackModified(reqModifiedHeader, res)) {
		res.writeHead(304);
		res.end();
		return;
	}

	let svg = renderSVGLetters(requestUsername, avatarSize);

	if (settings.get('UI_Use_Name_Avatar')) {
		const user = await Users.findOneByUsernameIgnoringCase(requestUsername, {
			projection: {
				name: 1,
			},
		});

		if (user && user.name) {
			svg = renderSVGLetters(user.name, avatarSize);
		}
	}

	serveAvatar(svg, req.query.format, res);
};
