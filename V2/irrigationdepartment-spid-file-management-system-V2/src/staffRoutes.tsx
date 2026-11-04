import React from 'react';
import {
  MdHome,
  MdSearch,
  MdNoteAdd,
  MdAssignment,
  MdListAlt,
} from 'react-icons/md';

const staffRoutes = [
  {
    name: 'Dashboard',
    layout: '/staff',
    path: 'default',
    icon: <MdHome className="h-5 w-5" />,
  },
  {
    name: 'View & Search Files',
    layout: '/staff',
    path: 'files',
    icon: <MdSearch className="h-5 w-5" />,
  },
  {
    name: 'Add New File',
    layout: '/staff',
    path: 'add-new-file',
    icon: <MdNoteAdd className="h-5 w-5" />,
  },
  {
    name: 'Request a File',
    layout: '/staff',
    path: 'request-file',
    icon: <MdAssignment className="h-5 w-5" />,
  },
  {
    name: 'Your Requests',
    layout: '/staff',
    path: 'your-requests',
    icon: <MdListAlt className="h-5 w-5" />,
  },
];

export default staffRoutes;
