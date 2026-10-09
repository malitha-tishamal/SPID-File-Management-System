/* eslint-disable */

import { HiX } from 'react-icons/hi';
import Links from './components/Links';

import SidebarCard from 'components/sidebar/components/SidebarCard';
import { IRoute } from 'types/navigation';

function SidebarHorizon(props: { routes: IRoute[]; [x: string]: any }) {
  const { routes, open, setOpen } = props;
  return (
    <div
      className={`sm:none duration-175 linear fixed !z-50 flex min-h-full flex-col bg-white pb-10 shadow-2xl shadow-white/5 transition-all dark:!bg-navy-800 dark:text-white md:!z-50 lg:!z-50 xl:!z-0 ${
        open ? 'translate-x-0' : '-translate-x-96 xl:translate-x-0'
      }`}
    >
      <span
        className="absolute right-4 top-4 block cursor-pointer xl:hidden"
        onClick={() => setOpen(false)}
      >
        <HiX />
      </span>

      {/* SPID Official Branding Header */}
      <div className="mx-[28px] mt-[36px] flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-white p-1 shadow-md border border-slate-200/80 flex items-center justify-center shrink-0">
          <img
            src="/img/spid/spid-logo.png"
            alt="SPID Logo"
            className="h-full w-full object-contain select-none"
          />
        </div>
        <div className="flex flex-col">
          <div className="font-poppins text-[15px] font-black uppercase text-navy-700 dark:text-white tracking-tight leading-tight">
            SPID <span className="text-[#4318FF] font-extrabold">SYSTEM</span>
          </div>
          <span className="text-[9px] font-bold uppercase text-sky-600 dark:text-sky-400 tracking-wider">
            Irrigation Dept.
          </span>
        </div>
      </div>

      <div className="mb-6 mt-6 h-px bg-gray-200 dark:bg-white/20" />

      {/* Nav items */}
      <ul className="mb-auto pt-1">
        <Links routes={routes} />
      </ul>

      {/* Department System Badge Card */}
      <div className="flex justify-center px-4">
        <SidebarCard />
      </div>
    </div>
  );
}

export default SidebarHorizon;
