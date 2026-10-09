import React from 'react';

// Icon Imports
import {
  MdHome,
  MdFolder,
  MdBarChart,
  MdPerson,
  MdLock,
  MdPeopleAlt,
  MdArchive,
} from 'react-icons/md';

const routes = [
  {
    name: 'Dashboard',
    layout: '/admin',
    path: 'default',
    icon: <MdHome className="h-6 w-6" />,
  },
  {
    name: 'File Repository',
    layout: '/admin',
    path: 'nft-marketplace',
    icon: <MdFolder className="h-6 w-6" />,
    secondary: true,
  },
  {
    name: 'File Records',
    layout: '/admin',
    icon: <MdBarChart className="h-6 w-6" />,
    path: 'data-tables',
  },
  {
    name: 'User Management',
    layout: '/admin',
    icon: <MdPeopleAlt className="h-6 w-6" />,
    path: 'users',
  },
  {
    name: 'Profile',
    layout: '/admin',
    path: 'profile',
    icon: <MdPerson className="h-6 w-6" />,
  },
  {
    name: 'Sign In',
    layout: '/auth',
    path: 'sign-in',
    icon: <MdLock className="h-6 w-6" />,
  },
];
export default routes;
