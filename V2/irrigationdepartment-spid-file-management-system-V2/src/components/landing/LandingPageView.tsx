'use client';

import React from 'react';
import Navbar from './Navbar';
import HeroSection from './HeroSection';
import AboutSection from './AboutSection';
import FeaturesSection from './FeaturesSection';
import WorkflowSection from './WorkflowSection';
import SecuritySection from './SecuritySection';
import StatsSection from './StatsSection';
import CtaSection from './CtaSection';
import Footer from './Footer';

interface LandingPageViewProps {
  isAuthenticated?: boolean;
  dashboardUrl?: string;
  filesCount?: number | null;
  sectionsCount?: number | null;
  approvedUsersCount?: number | null;
}

export default function LandingPageView({
  isAuthenticated = false,
  dashboardUrl = '/auth/sign-in',
  filesCount = null,
  sectionsCount = null,
  approvedUsersCount = null,
}: LandingPageViewProps) {
  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-navy-900 dark:text-white font-sans selection:bg-[#4318FF]/20 selection:text-[#4318FF]">
      <Navbar isAuthenticated={isAuthenticated} dashboardUrl={dashboardUrl} />
      <main id="main-content">
        <HeroSection
          isAuthenticated={isAuthenticated}
          dashboardUrl={dashboardUrl}
          totalFiles={filesCount ?? 49}
        />
        <AboutSection />
        <FeaturesSection />
        <WorkflowSection />
        <SecuritySection />
        <StatsSection
          filesCount={filesCount}
          sectionsCount={sectionsCount}
          approvedUsersCount={approvedUsersCount}
        />
        <CtaSection
          isAuthenticated={isAuthenticated}
          dashboardUrl={dashboardUrl}
        />
      </main>
      <Footer />
    </div>
  );
}
