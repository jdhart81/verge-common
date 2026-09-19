import { assessmentIsCurrent } from './readiness.mjs';

// These are recorded setup steps, not a certification or permission to pay.
export function onboardingProgress(state) {
  return {
    circle:
      state.members.filter(
        (member) => member.status === 'active' && member.role === 'steward',
      ).length >= 2,
    assessment: state.projects.some((project) => {
      const latest = (state.assessments ?? [])
        .filter((assessment) => assessment.projectId === project.id)
        .at(-1);
      return (
        !!latest &&
        latest.status === 'reviewed' &&
        assessmentIsCurrent(state, latest)
      );
    }),
  };
}
