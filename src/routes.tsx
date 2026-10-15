import React from 'react';

// Icon Imports
import {
  MdHome,
  MdFolder,
  MdFolderOpen,
  MdNoteAdd,
  MdPerson,
  MdLock,
  MdPeopleAlt,
  MdAdminPanelSettings,
  MdCategory,
  MdAssignment,
} from 'react-icons/md';
import { FiFileText } from 'react-icons/fi';

const routes = [
  {
    name: 'Dashboard',
    layout: '/admin',
    path: 'default',
    icon: <MdHome className="h-5 w-5" />,
  },
  {
    name: 'Manage System Files',
    layout: '/admin',
    path: 'nft-marketplace',
    icon: <MdFolder className="h-5 w-5" />,
    secondary: true,
  },
  {
    name: 'Issue Files Details',
    layout: '/admin',
    icon: <FiFileText className="h-5 w-5" />,
    path: 'data-tables',
  },
  {
    name: 'Add New File',
    layout: '/admin',
    icon: <MdNoteAdd className="h-5 w-5" />,
    path: 'add-new-file',
  },
  {
    name: 'Admin Management',
    layout: '/admin',
    icon: <MdAdminPanelSettings className="h-5 w-5" />,
    path: 'admin-management',
  },
  {
    name: 'User Management',
    layout: '/admin',
    icon: <MdPeopleAlt className="h-5 w-5" />,
    path: 'users',
  },
  {
    name: 'Section Management',
    layout: '/admin',
    icon: <MdCategory className="h-5 w-5" />,
    path: 'section-management',
  },
  {
    name: 'Staff File Request',
    layout: '/admin',
    icon: <MdAssignment className="h-5 w-5" />,
    path: 'staff-file-request',
  },
  {
    name: 'Profile',
    layout: '/admin',
    path: 'profile',
    icon: <MdPerson className="h-5 w-5" />,
  },
  {
    name: 'Sign In',
    layout: '/auth',
    path: 'sign-in',
    icon: <MdLock className="h-5 w-5" />,
  },
];
export default routes;
