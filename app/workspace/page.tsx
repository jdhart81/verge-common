import { requireChatGPTUser } from '@/app/chatgpt-auth';
import { NetworkApp } from '@/components/network-app';
export const dynamic = 'force-dynamic';
export default async function Workspace() {
  await requireChatGPTUser('/workspace/');
  return <NetworkApp mode="workspace" signedIn />;
}
