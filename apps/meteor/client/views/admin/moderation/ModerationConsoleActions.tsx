import { GenericMenu } from '@rocket.chat/ui-client';
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { ModerationConsoleRowProps } from './ModerationConsoleTableRow';
import useDeactivateUserAction from './hooks/useDeactivateUserAction';
import useDeleteMessagesAction from './hooks/useDeleteMessagesAction';
import useDismissUserAction from './hooks/useDismissUserAction';
import useResetAvatarAction from './hooks/useResetAvatarAction';

const ModerationConsoleActions = ({ report, onClick }: Omit<ModerationConsoleRowProps, 'isDesktopOrLarger'>): JSX.Element => {
	const { t } = useTranslation();
	const { userId: uid, isUserDeleted } = report;

	return (
		<>
			<GenericMenu
				title={t('Options')}
				sections={[
					{
						items: [
							{
								id: 'seeReports',
								content: t('Moderation_See_messages'),
								icon: 'document-eye',
								onClick: () => onClick(uid),
							},
						],
					},
					{
						items: [
							useDismissUserAction(uid),
							useDeleteMessagesAction(uid),
							{ ...useDeactivateUserAction(uid), ...(isUserDeleted && { disabled: true }) },
							{ ...useResetAvatarAction(uid), ...(isUserDeleted && { disabled: true }) },
						],
					},
				]}
				placement='bottom-end'
			/>
		</>
	);
};

export default ModerationConsoleActions;
