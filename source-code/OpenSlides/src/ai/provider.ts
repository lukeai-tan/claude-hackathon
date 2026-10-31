/** Claudia design proposals. The UI always previews before applying changes. */
export { requestPlan } from './client';
export { preparePlan, applyPreparedPlan } from './apply';
export { BUILTIN_AGENTS, AI_TOOLS, validateAgent } from './schema';
export type { AiPlan, DesignAgent, AiTool } from './schema';
