const Footer = () => {
  return (
    <div className="flex w-full flex-col items-center justify-between px-1 pb-8 pt-3 lg:px-8 xl:flex-row">
      <p className="mb-4 text-center text-sm font-medium text-gray-600 dark:text-gray-400 sm:!mb-0 md:text-sm">
        <span>
          ©{new Date().getFullYear()} Southern Provincial Irrigation Department. All rights reserved. • Secure Archival Portal
        </span>
      </p>
      <div>
        <ul className="flex flex-wrap items-center gap-3 sm:flex-nowrap md:gap-6 text-xs text-gray-500 dark:text-gray-400">
          <li>
            <a
              href="mailto:info@spid.gov.lk"
              className="font-medium hover:text-[#4318FF] transition"
            >
              SPID Helpdesk
            </a>
          </li>
          <li>
            <a
              href="#!"
              className="font-medium hover:text-[#4318FF] transition"
            >
              Archival Protocols
            </a>
          </li>
          <li>
            <a
              href="#!"
              className="font-medium hover:text-[#4318FF] transition"
            >
              Security Policy
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Footer;
