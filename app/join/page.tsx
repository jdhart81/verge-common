import { getChatGPTUser } from '@/app/chatgpt-auth';
import { JoinCoop } from '@/components/join-coop';
export const dynamic = 'force-dynamic';
export default async function Join() {
  return <JoinCoop signedIn={!!(await getChatGPTUser())} />;
}
