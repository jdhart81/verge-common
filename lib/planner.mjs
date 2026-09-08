export const STORAGE_KEY = 'verge-common-plan-v1';
const clean = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
export function emptyPlan() {
  return { version: 1, name: '', area: '', purpose: '', notes: '', tasks: [] };
}
export function parsePlan(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.tasks))
    throw new Error('Unsupported plan format.');
  return {
    version: 1,
    name: clean(value.name, 100),
    area: clean(value.area, 140),
    purpose: clean(value.purpose, 600),
    notes: clean(value.notes, 2000),
    tasks: value.tasks.slice(0, 100).map((t, i) => {
      if (!t || typeof t.title !== 'string' || typeof t.done !== 'boolean')
        throw new Error('Invalid action.');
      return { id: String(i), title: clean(t.title, 180), done: t.done };
    }),
  };
}
export function addTask(plan, title, id) {
  const text = clean(title, 180);
  if (!text) throw new Error('Give the action a short name.');
  if (plan.tasks.length >= 100)
    throw new Error('This plan can hold up to 100 actions.');
  return { ...plan, tasks: [...plan.tasks, { id, title: text, done: false }] };
}
export function invitation(plan, url) {
  return `Let’s care for ${plan.name || 'a place in our neighborhood'}.${plan.area ? `\nArea: ${plan.area}` : ''}${plan.purpose ? `\nOur purpose: ${plan.purpose}` : ''}\n${plan.tasks
    .filter((t) => !t.done)
    .map((t) => `• ${t.title}`)
    .join(
      '\n',
    )}\nReply to me if you’d like to help.\nPlan your own local action with Verge Common: ${url}\nThis invitation is a text copy, not a shared online workspace.`;
}
