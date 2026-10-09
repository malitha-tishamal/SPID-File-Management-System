import React, { useEffect, useState } from 'react';
import Dropdown from 'components/dropdown';
import { FiAlignJustify, FiSearch, FiLogOut, FiUser } from 'react-icons/fi';
import NavLink from 'components/link/NavLink';
import { BsArrowBarUp } from 'react-icons/bs';
import { RiMoonFill, RiSunFill } from 'react-icons/ri';
import {
  IoMdNotificationsOutline,
  IoMdInformationCircleOutline,
} from 'react-icons/io';
import avatar from '/public/img/avatars/avatar4.png';
import Image from 'next/image';
import { getCurrentUser, logoutUser, UserSession } from 'utils/auth';

const Navbar = (props: {
  onOpenSidenav: () => void;
  brandText: string;
  secondary?: boolean | string;
  [x: string]: any;
}) => {
  const { onOpenSidenav, brandText } = props;
  const [darkmode, setDarkmode] = useState(false);
  const [user, setUser] = useState<UserSession | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setDarkmode(document.body.classList.contains('dark'));
    }
    const currentUser = getCurrentUser();
    setUser(currentUser);
  }, []);

  const handleLogout = () => {
    logoutUser();
  };

  return (
    <nav className="sticky top-4 z-40 flex flex-row flex-wrap items-center justify-between rounded-xl bg-white/10 p-2 backdrop-blur-xl dark:bg-[#0b14374d]">
      <div className="ml-[6px]">
        <div className="h-6 w-full pt-1">
          <a
            className="text-sm font-normal text-navy-700 hover:underline dark:text-white dark:hover:text-white"
            href="#"
          >
            SPID System
            <span className="mx-1 text-sm text-navy-700 hover:text-navy-700 dark:text-white">
              {' '}/{' '}
            </span>
          </a>
          <NavLink
            className="text-sm font-normal capitalize text-navy-700 hover:underline dark:text-white dark:hover:text-white"
            href="#"
          >
            {brandText}
          </NavLink>
        </div>
        <p className="shrink text-[30px] font-bold capitalize text-navy-700 dark:text-white">
          <NavLink
            href="#"
            className="font-bold capitalize hover:text-navy-700 dark:hover:text-white"
          >
            {brandText}
          </NavLink>
        </p>
      </div>

      <div className="relative mt-[3px] flex h-[61px] w-[355px] flex-grow items-center justify-around gap-2 rounded-full bg-white px-2 py-2 shadow-xl shadow-shadow-500 dark:!bg-navy-800 dark:shadow-none md:w-[380px] md:flex-grow-0 md:gap-1 xl:w-[410px] xl:gap-2">
        {/* Search Bar */}
        <div className="flex h-full items-center rounded-full bg-lightPrimary text-navy-700 dark:bg-navy-900 dark:text-white xl:w-[240px]">
          <p className="pl-3 pr-2 text-xl">
            <FiSearch className="h-4 w-4 text-gray-400 dark:text-white" />
          </p>
          <input
            type="text"
            placeholder="Search files, dossiers..."
            className="block h-full w-full rounded-full bg-lightPrimary text-xs font-medium text-navy-700 outline-none placeholder:!text-gray-400 dark:bg-navy-900 dark:text-white dark:placeholder:!text-white sm:w-fit"
          />
        </div>

        <span
          className="flex cursor-pointer text-xl text-gray-600 dark:text-white xl:hidden"
          onClick={onOpenSidenav}
        >
          <FiAlignJustify className="h-5 w-5" />
        </span>

        {/* Notifications */}
        <Dropdown
          button={
            <p className="cursor-pointer">
              <IoMdNotificationsOutline className="h-4 w-4 text-gray-600 dark:text-white" />
            </p>
          }
          animation="origin-[65%_0%] md:origin-top-right transition-all duration-300 ease-in-out"
          classNames={'py-2 top-4 -left-[230px] md:-left-[440px] w-max'}
        >
          <div className="flex w-[360px] flex-col gap-3 rounded-[20px] bg-white p-4 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white dark:shadow-none sm:w-[420px]">
            <div className="flex items-center justify-between">
              <p className="text-base font-bold text-navy-700 dark:text-white">
                Department Notifications
              </p>
              <p className="text-xs font-semibold text-[#4318FF] hover:underline cursor-pointer">
                Mark all read
              </p>
            </div>

            <div className="flex w-full items-center rounded-xl bg-slate-50 dark:bg-navy-800 p-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#4318FF] to-brand-500 text-white">
                <BsArrowBarUp className="h-5 w-5" />
              </div>
              <div className="ml-3 flex flex-col justify-center text-xs">
                <p className="font-bold text-gray-900 dark:text-white">
                  Circular #SPID/CIR/2026/04
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-300">
                  Updated guidelines for river basin &amp; tank dossier archiving.
                </p>
              </div>
            </div>

            <div className="flex w-full items-center rounded-xl bg-slate-50 dark:bg-navy-800 p-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-teal-500 to-emerald-600 text-white">
                <BsArrowBarUp className="h-5 w-5" />
              </div>
              <div className="ml-3 flex flex-col justify-center text-xs">
                <p className="font-bold text-gray-900 dark:text-white">
                  File Requisition Approved
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-300">
                  File #GAL-IRR-2026-081 ready for archival download.
                </p>
              </div>
            </div>
          </div>
        </Dropdown>

        {/* SPID Info Dropdown */}
        <Dropdown
          button={
            <p className="cursor-pointer">
              <IoMdInformationCircleOutline className="h-4 w-4 text-gray-600 dark:text-white" />
            </p>
          }
          classNames={'py-2 top-6 -left-[250px] md:-left-[330px] w-max'}
          animation="origin-[75%_0%] md:origin-top-right transition-all duration-300 ease-in-out"
        >
          <div className="flex w-[320px] flex-col gap-2 rounded-[20px] bg-white p-4 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white dark:shadow-none">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-full bg-white p-1 border border-slate-200 shrink-0 shadow-sm">
                <img
                  src="/img/spid/spid-logo.png"
                  alt="SPID Logo"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-white">
                  SPID File Management System
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Southern Provincial Irrigation Department
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Official records, irrigation engineering dossiers, and cadastral archives portal.
            </p>
            <div className="mt-2 text-[11px] text-slate-400">
              System Version: 1.0.0 (Production)
            </div>
          </div>
        </Dropdown>

        {/* Dark Mode Toggle */}
        <div
          className="cursor-pointer text-gray-600"
          onClick={() => {
            if (darkmode) {
              document.body.classList.remove('dark');
              setDarkmode(false);
            } else {
              document.body.classList.add('dark');
              setDarkmode(true);
            }
          }}
        >
          {darkmode ? (
            <RiSunFill className="h-4 w-4 text-gray-600 dark:text-white" />
          ) : (
            <RiMoonFill className="h-4 w-4 text-gray-600 dark:text-white" />
          )}
        </div>

        {/* Profile Dropdown with Real Logout */}
        <Dropdown
          button={
            <div className="h-10 w-10 rounded-full bg-indigo-50 border-2 border-[#4318FF] flex items-center justify-center cursor-pointer text-[#4318FF] font-bold text-sm shadow-sm">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'SP'}
            </div>
          }
          classNames={'py-2 top-8 -left-[200px] w-max'}
        >
          <div className="flex w-64 flex-col justify-start rounded-[20px] bg-white p-4 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white dark:shadow-none">
            <div className="flex flex-col">
              <p className="text-xs font-bold text-navy-700 dark:text-white">
                👋 {user?.name || 'Eng. K. L. Perera'}
              </p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {user?.email || 'officer@spid.gov.lk'}
              </p>
              <span className="mt-1 inline-block w-fit rounded bg-indigo-50 dark:bg-navy-800 px-1.5 py-0.5 text-[10px] font-semibold text-[#4318FF] dark:text-brand-400">
                {user?.division || 'Record Room & Central Registry'}
              </span>
            </div>

            <div className="my-3 h-px w-full bg-gray-200 dark:bg-white/20" />

            <div className="flex flex-col gap-2">
              <NavLink
                href="/admin/profile"
                className="text-xs text-gray-800 dark:text-white hover:text-[#4318FF] flex items-center gap-2 py-1"
              >
                <FiUser className="h-3.5 w-3.5" />
                Officer Profile
              </NavLink>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-600 pt-1 text-left"
              >
                <FiLogOut className="h-3.5 w-3.5" />
                Log Out
              </button>
            </div>
          </div>
        </Dropdown>
      </div>
    </nav>
  );
};

export default Navbar;
