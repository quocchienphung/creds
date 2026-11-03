/**
 * What a block is for. A role is a label, a starting set of instructions and a short guide for the person building the map:
 * picking a role fills the instructions of a new block (the person can rewrite them), tells a connected engine what the block
 * is meant to do, and offers sub-blocks that usually go with it. The wording below is this page's own default text, not
 * something an AI vendor defines; the split into planner / creator / coder / QA / reviewer / fixer follows the roles that
 * multi-agent software systems commonly use (for example AgentMesh's planner, coder, debugger and reviewer, and MetaGPT's and
 * ChatDev's product, engineering and test roles), and the loop between QA and fixer is the "evaluator-optimizer" pattern, which
 * is why every loop here has a round limit. `custom` is a block without a role.
 */
export type Role = "coordinator" | "planner" | "creator" | "coder" | "qa" | "reviewer" | "fixer" | "reverter" | "revoker" | "instructor" | "helper" | "processor" | "custom";

/** A sub-block a role usually needs: used by "Add a suggested sub-block". */
export interface RoleStep { name: string; task: string; role: Role }

/** What the person is told about a role so tasks and sub-tasks are easy to hand out. */
export interface RoleGuide {
  /** When to put this block on the map. */
  when: string;
  /** What it should be given. */
  receives: string;
  /** What it passes on, and to whom. */
  hands: string;
  /** The usual mistake with this role. */
  watch: string;
  /** Roles that usually come next, in the order they are likely to be wanted. */
  next: readonly Role[];
  /** Sub-blocks that usually belong under it. */
  steps: readonly RoleStep[];
}

export interface RoleInfo { id: Role; label: string; description: string; instructions: string; color: string; guide: RoleGuide | null }

export const roles: readonly RoleInfo[] = [
  { id: "coordinator", label: "Coordinator", color: "#4f46e5", description: "Splits the goal, hands each part to the right block and reports when everything is done.",
    instructions: "You coordinate this work. Split the goal into parts, hand each part to the block that fits it, keep track of what is finished and report when all of it is done. Do not do the parts yourself.",
    guide: {
      when: "The block in the middle. It owns the goal and decides which block goes next. One per map is enough.",
      receives: "The goal, in your words, and any limit (time, cost, what it must not touch).",
      hands: "To the Planner first, then to the blocks that do the work. It takes the final report back; connect the last block to it to close a loop.",
      watch: "It should coordinate, not work. If it starts writing code or copy, give that to a Coder or Creator block.",
      next: ["planner", "creator", "coder"],
      steps: [
        { name: "Plan the work", task: "Turn the goal into steps and say who does each one", role: "planner" },
        { name: "Report", task: "Collect what every block produced and write the final report", role: "instructor" },
      ],
    } },
  { id: "planner", label: "Planner", color: "#2f6bff", description: "Breaks a goal into small ordered steps and says who should do each one.",
    instructions: "You plan. Break the goal into small, ordered steps. For each step say what must be true when it is done and which block should do it. Do not carry the steps out.",
    guide: {
      when: "Right after the Coordinator, before anyone builds. Use it again when a loop starts a new round and the plan may have to change.",
      receives: "The goal and what is already known (research from a Helper, the last round's findings).",
      hands: "A numbered list of small steps, each with its owner and what “done” means, to the Creator or Coder.",
      watch: "Steps that are too big for one block. If a step needs more than one kind of work, split it.",
      next: ["creator", "coder", "helper"],
      steps: [
        { name: "List the steps", task: "Write the steps in order, each small enough for one block", role: "planner" },
        { name: "Define done", task: "Say what must be true when each step is finished", role: "planner" },
        { name: "Research first", task: "Look up what the plan depends on before it is final", role: "helper" },
      ],
    } },
  { id: "creator", label: "Creator", color: "#c026d3", description: "Makes the first version of what is needed: copy, a design brief, a draft or a spec.",
    instructions: "You create. Make the first version of what the task asks for (copy, a design brief, a draft, a spec), complete enough that the next block can use it without asking you. Keep to the brief and say what you assumed.",
    guide: {
      when: "When something has to exist before it can be built or checked: the words on a page, a design brief, a data model, a test plan.",
      receives: "One step from the Planner, with its “done” rule, plus any brand or style notes.",
      hands: "One finished deliverable to the Coder (to build it) or the Reviewer (to judge it).",
      watch: "Several deliverables in one block. Give each its own Creator so each can be reviewed and redone alone.",
      next: ["coder", "reviewer"],
      steps: [
        { name: "First draft", task: "Write the first complete version", role: "creator" },
        { name: "Alternatives", task: "Make two different versions so one can be chosen", role: "creator" },
        { name: "Review the draft", task: "Judge the draft against the brief and say what to change", role: "reviewer" },
      ],
    } },
  { id: "coder", label: "Coder", color: "#0d9488", description: "Writes or changes code for the step it is given and explains what it changed.",
    instructions: "You write code. Make the change the step asks for, keep it small, and finish with a short note of what you changed and why.",
    guide: {
      when: "For every step that changes code or configuration.",
      receives: "One step, the Creator's spec or brief, and where the code lives.",
      hands: "The change and a short note of what changed and why, to QA.",
      watch: "Big changes in one go. Small steps are easier to check and to undo.",
      next: ["qa", "reviewer"],
      steps: [
        { name: "Make the change", task: "Implement the step in small commits", role: "coder" },
        { name: "Test it", task: "Run the checks and report pass or fail with evidence", role: "qa" },
        { name: "Fix what fails", task: "Fix whatever the tests found", role: "fixer" },
      ],
    } },
  { id: "qa", label: "QA", color: "#0ea5e9", description: "Checks that the result works: runs the tests, tries the flow, reports pass or fail with evidence.",
    instructions: "You check the work. Run the checks the task names and try it the way a user would. Report pass or fail with the evidence: what you ran and what happened. Do not fix what fails; report it.",
    guide: {
      when: "After every Coder or Creator block whose result can be tested.",
      receives: "The result to check, the plan's “done” rule for it, and how to run the checks.",
      hands: "A pass or fail report with evidence. Pass goes to the Reviewer; fail goes to the Fixer, and the Fixer goes back to QA (a loop).",
      watch: "A vague bar. Say exactly what passing means, or QA will approve anything. Give the loop a round limit.",
      next: ["reviewer", "fixer"],
      steps: [
        { name: "Write the checks", task: "Turn the plan's “done” rules into test cases", role: "qa" },
        { name: "Run the checks", task: "Run every check and record the result", role: "qa" },
        { name: "Try it as a user", task: "Go through the main flow by hand and note anything odd", role: "qa" },
      ],
    } },
  { id: "reviewer", label: "Reviewer", color: "#334155", description: "Judges the result against the goal for quality, safety and completeness, then approves it or sends it back.",
    instructions: "You review. Judge the result against the goal for correctness, completeness and safety. Approve it, or send it back with the specific reasons. Do not rewrite it yourself.",
    guide: {
      when: "Before anything goes out: after QA passes, before a deploy, a send or a publish.",
      receives: "The result, QA's evidence and the goal.",
      hands: "An approval, or a list of reasons it goes back. On approval it hands to whatever ships; if not, back to the Creator or Coder.",
      watch: "Turn on “Ask me before it runs” on the step after the Reviewer for anything that cannot be undone. A Reviewer is an AI's opinion, not a person's decision.",
      next: ["processor", "instructor", "coordinator"],
      steps: [
        { name: "Review the change", task: "Read the result and judge it against the goal", role: "reviewer" },
        { name: "Approve or send back", task: "Say yes, or list the reasons it goes back", role: "reviewer" },
      ],
    } },
  { id: "fixer", label: "Fixer", color: "#d97706", description: "Finds why something fails, fixes the smallest part that is wrong and checks it works again.",
    instructions: "You fix problems. Find out why it fails, change the smallest part that is wrong, and run the check again. Say what was wrong and what you changed.",
    guide: {
      when: "When QA or a Reviewer reports a failure.",
      receives: "The failure report with its evidence, and the code or text it is about.",
      hands: "The fix and what was wrong. Connect it back to QA so the fix is checked, and set the loop's rounds so it cannot go on forever.",
      watch: "A Fixer that rewrites everything. Ask for the smallest change that fixes the cause.",
      next: ["qa"],
      steps: [
        { name: "Find the cause", task: "Reproduce the failure and find why it happens", role: "fixer" },
        { name: "Fix it", task: "Change the smallest part that is wrong", role: "fixer" },
        { name: "Check again", task: "Run the failing check again", role: "qa" },
      ],
    } },
  { id: "reverter", label: "Reverter", color: "#dc2626", description: "Undoes a change that went wrong and puts things back as they were.",
    instructions: "You undo changes. Put things back exactly as they were before the change that went wrong, check that they are, and list what you restored.",
    guide: {
      when: "As the safety net: connect it to the block that ships, so a bad release can be rolled back.",
      receives: "What went wrong and the last version known to be good.",
      hands: "A confirmation that things are back as they were, to the Coordinator or the Revoker.",
      watch: "No clear “last good”. Say what to go back to, or it will guess.",
      next: ["revoker", "coordinator"],
      steps: [
        { name: "Find the last good version", task: "Say which version everything should go back to", role: "reverter" },
        { name: "Roll back", task: "Put it back exactly as it was and check it", role: "reverter" },
      ],
    } },
  { id: "revoker", label: "Revoker", color: "#be185d", description: "Withdraws access, keys or permissions that are no longer needed or are no longer safe.",
    instructions: "You withdraw access. Revoke the keys, tokens and permissions that are no longer needed or are no longer safe, confirm each one is gone, and list what you revoked.",
    guide: {
      when: "At the end of a run, or after a failure, to close what the blocks opened: temporary keys, tokens, shared links.",
      receives: "The list of what was opened, or the incident.",
      hands: "A list of what was revoked and confirmed gone, to the Coordinator.",
      watch: "Revoking without a list. Have a Helper or the Coordinator write down what was opened first, and ask for approval before it runs.",
      next: ["coordinator"],
      steps: [
        { name: "List what is open", task: "List the keys, tokens and permissions in use", role: "helper" },
        { name: "Revoke", task: "Revoke each one that is no longer needed and confirm it is gone", role: "revoker" },
      ],
    } },
  { id: "instructor", label: "Instructor", color: "#7c3aed", description: "Explains the result step by step, in plain words, for whoever has to follow it.",
    instructions: "You explain. Describe the result step by step in plain words for someone who was not here. Say what to do next and what to watch for.",
    guide: {
      when: "At the end, so a person can follow what happened, or where a step needs a how-to.",
      receives: "The results of the blocks before it.",
      hands: "A summary or how-to written for a person.",
      watch: "Jargon. Say who it is written for.",
      next: ["coordinator"],
      steps: [
        { name: "Summarize", task: "Write what happened in plain words", role: "instructor" },
        { name: "How to", task: "Write the steps someone follows to use the result", role: "instructor" },
      ],
    } },
  { id: "helper", label: "Helper", color: "#0891b2", description: "Looks things up and answers the other blocks so they can keep working.",
    instructions: "You help the other blocks. Look up what they ask for, answer briefly and say how sure you are. Do not take over their work.",
    guide: {
      when: "Wherever a block needs a fact it does not have: prices, docs, examples, a comparison.",
      receives: "A question from another block.",
      hands: "A short answer with how sure it is, back to the block that asked.",
      watch: "A Helper that starts doing the asking block's job.",
      next: ["planner", "creator"],
      steps: [
        { name: "Look it up", task: "Find the answer and say how sure you are", role: "helper" },
        { name: "Compare options", task: "Compare the options in a short table", role: "helper" },
      ],
    } },
  { id: "processor", label: "Processor", color: "#65a30d", description: "Takes in data or files, cleans and transforms them and passes the result on. Also the place for repeatable steps like build and deploy.",
    instructions: "You process data. Read what you are given, clean and transform it as the task says, and pass on a result in the same shape every time.",
    guide: {
      when: "For repeatable, mechanical steps: cleaning data, converting files, running the build, publishing or deploying.",
      receives: "The data, files or build to work on, and the format wanted.",
      hands: "The result in the same shape every time.",
      watch: "A deploy or publish with nobody asked. Turn on “Ask me before it runs” for it, and put a Reviewer and a Reverter around it.",
      next: ["reverter", "instructor", "coordinator"],
      steps: [
        { name: "Clean the data", task: "Remove what is wrong or duplicated", role: "processor" },
        { name: "Convert it", task: "Turn it into the format the next block needs", role: "processor" },
        { name: "Deploy", task: "Build and publish the approved result", role: "processor" },
      ],
    } },
  { id: "custom", label: "No role", color: "#8f8f8f", description: "A block you define yourself.", instructions: "", guide: null },
];

export const roleIds = roles.map(role => role.id);
export const roleOf = (id: Role) => roles.find(role => role.id === id) ?? roles[roles.length - 1];
