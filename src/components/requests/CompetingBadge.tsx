import { useTranslation } from 'react-i18next';
import { FiAlertCircle } from 'react-icons/fi';
import {
  getCompetingBadgeCopy,
  type CompetingBadgeVariant,
  type CompetingInfo,
} from 'lib/competing-requests';

/**
 * The competing-request badge every view uses, driven only by the shared rank
 * info so the admin queue, the staff list and the staff submission notice can
 * never describe the same request differently.
 *
 * No fixed width or height: long Sinhala labels wrap onto a second line inside
 * the cell instead of bleeding into the neighbouring column. `title` always
 * carries the full explanation for truncated/compact layouts.
 */
export default function CompetingBadge({
  info,
  variant = 'rank',
  className = '',
}: {
  info: CompetingInfo | null | undefined;
  variant?: CompetingBadgeVariant;
  className?: string;
}) {
  const { t } = useTranslation('staffRequests');
  const copy = getCompetingBadgeCopy(info, variant);
  if (!info || !copy) return null;

  // The wording lives in the dictionary; the visual state still comes from the
  // shared helper, so every view keeps describing a rank the same way.
  let label: string;
  let title: string;
  if (variant === 'count') {
    label = t('badges.competingCount', { count: info.groupSize });
    title = t('badges.competingCountTitle');
  } else if (info.isLeader) {
    label = info.isTie ? t('badges.tieLeader') : t('badges.highestPriority');
    title = info.isTie
      ? t('badges.tieLeaderTitle')
      : t('badges.highestPriorityTitle');
  } else if (info.samePriorityAsLeader) {
    label = t('badges.samePriorityLater');
    title = t('badges.samePriorityLaterTitle');
  } else {
    label = t('badges.lowerPriority');
    title = t('badges.lowerPriorityTitle');
  }

  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full px-2.5 py-1 text-[10px] font-bold leading-snug ${copy.className} ${className}`}
    >
      {variant === 'count' && (
        <FiAlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0">{label}</span>
    </span>
  );
}
