import Card from 'components/card';
import CardMenu from 'components/card/CardMenu';
import Switch from 'components/switch';
import { useTranslation } from 'react-i18next';

function Notification() {
  const { t } = useTranslation('profile');
  return (
    <Card extra={'w-full h-full p-3'}>
      <div className="relative mb-3 flex items-center justify-between pt-1">
        <h4 className="text-xl font-bold text-navy-700 dark:text-white">
          {t('notificationSettings.title')}
        </h4>
        <CardMenu />
      </div>
      <div className="flex flex-col">
        {/* the custom checkbox desing added in src/index.js */}
        <div className="mt-3 flex items-center gap-3">
          <Switch id="switch1" />
          <label
            htmlFor="checkbox1"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.itemComment')}
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch2" />
          <label
            htmlFor="checkbox2"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.buyerReview')}
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch3" />
          <label
            htmlFor="checkbox3"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.ratingReminders')}
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch4" />
          <label
            htmlFor="checkbox4"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.meetups')}
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch5" />
          <label
            htmlFor="checkbox5"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.companyNews')}
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch6" />
          <label
            htmlFor="checkbox6"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.newLaunches')}
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch7" />
          <label
            htmlFor="checkbox7"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.monthlyChanges')}
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch8" />
          <label
            htmlFor="checkbox8"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.newsletter')}
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Switch id="switch8" />
          <label
            htmlFor="checkbox8"
            className="text-base font-medium text-navy-700 dark:text-white"
          >
            {t('notificationSettings.follows')}
          </label>
        </div>
      </div>
    </Card>
  );
}

export default Notification;
