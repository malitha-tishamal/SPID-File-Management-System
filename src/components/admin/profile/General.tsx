import Card from "components/card";
import { useTranslation } from "react-i18next";

const General = () => {
  const { t } = useTranslation("profile");
  return (
    <Card extra={"w-full h-full p-3"}>
      {/* Header */}
      <div className="mt-2 mb-8 w-full">
        <h4 className="px-2 text-xl font-bold text-navy-700 dark:text-white">
          {t("general.title")}
        </h4>
        <p className="mt-2 px-2 text-base text-gray-600">
          {t("general.description")}
        </p>
      </div>
      {/* Cards */}
      <div className="grid grid-cols-2 gap-4 px-2">
        <div className="flex flex-col items-start justify-center rounded-2xl bg-white bg-clip-border px-3 py-4 shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none">
          <p className="text-sm text-gray-600">{t("general.education")}</p>
          <p className="text-base font-medium text-navy-700 dark:text-white">
            Stanford University
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-2xl bg-white bg-clip-border  px-3 py-4 shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none">
          <p className="text-sm text-gray-600">{t("general.languages")}</p>
          <p className="text-base font-medium text-navy-700 dark:text-white">
            {t("general.languageList")}
          </p>
        </div>

        <div className="flex flex-col items-start justify-center rounded-2xl bg-white bg-clip-border px-3 py-4 shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none">
          <p className="text-sm text-gray-600">{t("general.department")}</p>
          <p className="text-base font-medium text-navy-700 dark:text-white">
            {t("general.designValue")}
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-2xl bg-white bg-clip-border px-3 py-4 shadow-3xl shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none">
          <p className="text-sm text-gray-600">{t("general.workHistory")}</p>
          <p className="text-base font-medium text-navy-700 dark:text-white">
            {t("general.languageList")}
          </p>
        </div>

        <div className="flex flex-col items-start justify-center rounded-2xl bg-white bg-clip-border px-3 py-4 shadow-3xl shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none">
          <p className="text-sm text-gray-600">{t("general.organization")}</p>
          <p className="text-base font-medium text-navy-700 dark:text-white">
            Simmmple Web LLC
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-2xl bg-white bg-clip-border px-3 py-4 shadow-3xl shadow-shadow-500 dark:!bg-navy-700 dark:shadow-none">
          <p className="text-sm text-gray-600">{t("general.birthday")}</p>
          <p className="text-base font-medium text-navy-700 dark:text-white">
            {t("general.birthdayValue")}
          </p>
        </div>
      </div>
    </Card>
  );
};

export default General;
