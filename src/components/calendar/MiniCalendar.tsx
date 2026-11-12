'use client';

import { useState } from 'react';
import Calendar from 'react-calendar';
import Card from 'components/card';
import 'react-calendar/dist/Calendar.css';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';
import 'styles/MiniCalendar.css';
import { useAppLanguage } from 'i18n/LanguageProvider';
import {
  SINHALA_MONTHS_FULL,
  SINHALA_WEEKDAYS_SHORT,
  SINHALA_WEEKDAYS_NARROW,
} from 'lib/datetime';

const MiniCalendar = () => {
  const [value, onChange] = useState(new Date());
  const { language } = useAppLanguage();
  const isSinhala = language === 'si';

  return (
    <div>
      <Card extra="flex w-full h-full flex-col px-3 py-3">
        <Calendar
          onChange={onChange}
          value={value}
          prevLabel={<MdChevronLeft className="ml-1 h-6 w-6 " />}
          nextLabel={<MdChevronRight className="ml-1 h-6 w-6 " />}
          prev2Label={null}
          next2Label={null}
          view={'month'}
          locale={isSinhala ? 'si-LK' : 'en-LK'}
          formatShortWeekday={(_locale, date) =>
            isSinhala
              ? SINHALA_WEEKDAYS_NARROW[date.getDay()]
              : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][date.getDay()]
          }
          formatWeekday={(_locale, date) =>
            isSinhala
              ? SINHALA_WEEKDAYS_SHORT[date.getDay()]
              : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()]
          }
          formatMonthYear={(_locale, date) =>
            isSinhala
              ? `${date.getFullYear()} ${SINHALA_MONTHS_FULL[date.getMonth()]}`
              : new Intl.DateTimeFormat('en-LK', { month: 'long', year: 'numeric' }).format(date)
          }
          formatMonth={(_locale, date) =>
            isSinhala
              ? SINHALA_MONTHS_FULL[date.getMonth()]
              : new Intl.DateTimeFormat('en-LK', { month: 'long' }).format(date)
          }
        />
      </Card>
    </div>
  );
};

export default MiniCalendar;
