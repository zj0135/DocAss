import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const validationRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(validationRoot);
const readDocument = (relativePath) => readFileSync(path.join(docsRoot, relativePath), 'utf8');
const tasksText = readDocument('tasks.md');
const designText = readDocument('design-v1.md');
const requirementsText = readDocument('requirements.md');
const failures = [];
const taskHeadings = [...tasksText.matchAll(/^### a(\d+) \[([ x])\] (.+)$/gm)];
const tasks = taskHeadings.map((heading, index) => ({
  number: Number(heading[1]),
  complete: heading[2] === 'x',
  body: tasksText.slice(heading.index + heading[0].length, taskHeadings[index + 1]?.index ?? tasksText.indexOf('## 需求覆盖索引')),
}));

function expandTaskReferences(text) {
  const references = new Set();
  const remaining = text.replace(/a(\d+)\s*[–-]\s*a?(\d+)/g, (match, start, end) => {
    for (let number = Number(start); number <= Number(end); number += 1) references.add(number);
    if (Number(end) < Number(start)) failures.push(`Reversed task range: ${match}`);
    return '';
  });
  for (const match of remaining.matchAll(/\ba(\d+)\b/g)) references.add(Number(match[1]));
  return [...references];
}

if (tasks.length !== 62) failures.push(`Expected 62 tasks, found ${tasks.length}`);
let dependencyCount = 0;
for (const [index, task] of tasks.entries()) {
  if (task.number !== index + 1) failures.push(`Non-contiguous task at position ${index + 1}`);
  for (const label of ['依赖', '对应', '工作/交付', '验收']) {
    const field = task.body.match(new RegExp(`\\*\\*${label}\\*\\*：([^\\n]+)`));
    if (!field?.[1]?.trim()) failures.push(`a${task.number}: missing ${label}`);
  }
  const dependencyText = task.body.match(/\*\*依赖\*\*：(.+?)。\*\*对应\*\*/)?.[1];
  if (!dependencyText) failures.push(`a${task.number}: dependency field cannot be parsed`);
  const dependencies = expandTaskReferences(dependencyText ?? '');
  dependencyCount += dependencies.length;
  for (const dependency of dependencies) {
    if (dependency < 1 || dependency >= task.number) failures.push(`a${task.number}: invalid prerequisite a${dependency}`);
  }
}

const functionalRequirements = [...requirementsText.matchAll(/^- (F\d+\.\d+)\s/gm)].map((match) => match[1]);
const nonfunctionalRequirements = [...requirementsText.matchAll(/^\| (N\d+)\s/gm)].map((match) => match[1]);
const requirementIds = [...functionalRequirements, ...nonfunctionalRequirements];
const coverageText = tasksText.split('## 需求覆盖索引')[1]?.split('## 推荐执行顺序')[0] ?? '';
const coveredIds = new Set();
let coverageRows = 0;
for (const row of coverageText.split('\n')) {
  if (!/^\| [FN]\d/.test(row)) continue;
  coverageRows += 1;
  const [, requirementCell, taskCell] = row.split('|');
  const remaining = requirementCell.replace(/F(\d+)\.(\d+)–F(\d+)\.(\d+)|N(\d+)–N(\d+)/g, (match, groupStart, itemStart, groupEnd, itemEnd, nonfunctionalStart, nonfunctionalEnd) => {
    if (groupStart) {
      if (groupStart !== groupEnd || Number(itemStart) > Number(itemEnd)) failures.push(`Invalid requirement range: ${match}`);
      for (let item = Number(itemStart); item <= Number(itemEnd); item += 1) coveredIds.add(`F${groupStart}.${item}`);
    } else {
      if (Number(nonfunctionalStart) > Number(nonfunctionalEnd)) failures.push(`Invalid requirement range: ${match}`);
      for (let item = Number(nonfunctionalStart); item <= Number(nonfunctionalEnd); item += 1) coveredIds.add(`N${item}`);
    }
    return '';
  });
  for (const match of remaining.matchAll(/F\d+\.\d+|N\d+/g)) coveredIds.add(match[0]);
  if (!expandTaskReferences(taskCell).length) failures.push(`Coverage row has no tasks: ${requirementCell.trim()}`);
}
for (const requirementId of requirementIds) {
  if (!coveredIds.has(requirementId)) failures.push(`Unmapped requirement: ${requirementId}`);
}
for (const coveredId of coveredIds) {
  if (!requirementIds.includes(coveredId)) failures.push(`Unknown requirement: ${coveredId}`);
}
for (const reference of expandTaskReferences(`${tasksText}\n${designText}`)) {
  if (reference < 1 || reference > tasks.length) failures.push(`Unknown task reference: a${reference}`);
}

const linkedDocuments = ['README.md', 'design-v1.md', 'tasks.md', 'requirements.md', 'design.md', 'prototype-guide.md', 'validation/README.md'];
let localLinkCount = 0;
for (const document of linkedDocuments) {
  for (const match of readDocument(document).matchAll(/\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:\/\//i.test(target)) continue;
    localLinkCount += 1;
    if (!existsSync(path.resolve(docsRoot, path.dirname(document), target))) failures.push(`Missing local link: ${document} -> ${target}`);
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  scope: 'Document structure, prerequisites, requirement coverage, local file links; no product acceptance claimed.',
  taskCount: tasks.length,
  completedTaskCount: tasks.filter((task) => task.complete).length,
  dependencyCount,
  functionalRequirementCount: functionalRequirements.length,
  nonfunctionalRequirementCount: nonfunctionalRequirements.length,
  mappedRequirementCount: coveredIds.size,
  coverageRows,
  localLinkCount,
  passed: failures.length === 0,
  failures,
};
writeFileSync(path.join(validationRoot, 'planning-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
