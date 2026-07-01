import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { RegisteredSubject } from '@eval/subjects/registry';

export type SubjectPageProps = {
  /** The full registry — one row per registered subject. */
  subjects: Record<string, RegisteredSubject>;
  /** Name of the subject currently active (seeds the focused row). */
  currentSubjectName: string;
  /** Called with the chosen registry key when the user presses Enter. */
  onSelect: (subjectName: string) => void;
  onQuit: () => void;
};

export const SubjectPage: React.FC<SubjectPageProps> = ({
  subjects,
  currentSubjectName,
  onSelect,
  onQuit,
}) => {
  const names = Object.keys(subjects);
  const [focusedIdx, setFocusedIdx] = useState(() => {
    const i = names.indexOf(currentSubjectName);
    return i === -1 ? 0 : i;
  });

  useInput((input, key) => {
    if (key.upArrow) {
      setFocusedIdx((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setFocusedIdx((prev) => Math.min(names.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      onSelect(names[focusedIdx]);
      return;
    }
    if (key.escape || input === 'q') {
      onQuit();
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Step 1/5 — Subject ({names.length} registered)</Text>
      <Box marginTop={1} flexDirection="column">
        {names.map((name, idx) => {
          const entry = subjects[name];
          const focused = idx === focusedIdx;
          const isCurrent = name === currentSubjectName;
          const marker = isCurrent ? '(*)' : '( )';
          const caseCount = entry.subject.cases.length;
          return (
            <React.Fragment key={name}>
              <Text inverse={focused}>
                {`${marker} ${name}  [${caseCount} case${caseCount === 1 ? '' : 's'}]`}
              </Text>
              <Text dimColor>{`      ${entry.casesDir}`}</Text>
            </React.Fragment>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ nav · Enter select · Esc/q quit</Text>
      </Box>
    </Box>
  );
};
