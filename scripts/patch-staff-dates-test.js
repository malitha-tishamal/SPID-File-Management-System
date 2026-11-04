const { patchFile } = require('./patch-helper');

patchFile(
  './tests/staff-files-dates.test.tsx',
  `vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));`,
  `vi.mock('components/toast/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: { id: 'test-user', full_name: 'Test Staff', role: 'Staff' } }),
}));`,
);
