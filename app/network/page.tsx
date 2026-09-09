import { getChatGPTUser } from '@/app/chatgpt-auth';
import { NetworkApp } from '@/components/network-app';
export const dynamic = 'force-dynamic';
export default async function Network() {
  const user = await getChatGPTUser();
  return <NetworkApp mode="network" signedIn={!!user} />;
}
