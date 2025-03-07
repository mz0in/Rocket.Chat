import React from 'react';
import { useTranslation } from 'react-i18next';

import FilterByText from '../../../../components/FilterByText';
import DateRangePicker from './DateRangePicker';

type ModerationFilterProps = {
	setText: (text: string) => void;
	setDateRange: (dateRange: { start: string; end: string }) => void;
};

const ModerationFilter = ({ setText, setDateRange }: ModerationFilterProps) => {
	const { t } = useTranslation();

	return (
		<FilterByText shouldAutoFocus placeholder={t('Search')} onChange={setText}>
			<DateRangePicker onChange={setDateRange} />
		</FilterByText>
	);
};

export default ModerationFilter;
