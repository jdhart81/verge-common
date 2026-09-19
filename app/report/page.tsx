import type { Metadata } from 'next';
import { InformationPage } from '@/components/information-page';
import { SafetyReportForm } from '@/components/safety-report-form';

export const metadata: Metadata = { title: 'Report a concern · VergeCommon', description: 'Privately report a concern to the VergeCommon operator and check its status.' };
export default function ReportPage() {
  return <InformationPage title="A safer place to work together." intro="Send a private concern to the hosting operator, independently of your co-op’s stewards."><SafetyReportForm /></InformationPage>;
}
