'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type Choice = 'system' | 'light' | 'dark';
const KEY = 'snoopy-theme';

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/**
 * Three states rather than two: following the operating system is the default,
 * and an explicit choice overrides it in either direction.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>('system');

  useEffect(() => {
    setChoice((localStorage.getItem(KEY) as Choice | null) ?? 'system');
  }, []);

  function pick(next: Choice) {
    setChoice(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }

  /*
   * A segmented control rather than a cycling button.
   *
   * Cycling hides two things a person needs: which state is active, and what
   * the next press will do. Three visible options answer both at a glance and
   * make any state one press away instead of up to three.
   */
  const options: { value: Choice; label: string; icon: 'sun' | 'moon' | null }[] = [
    { value: 'system', label: 'Auto', icon: null },
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
  ];

  return (
    <div className="theme-switch" role="group" aria-label="Appearance">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`theme-switch-option${choice === option.value ? ' is-active' : ''}`}
          aria-pressed={choice === option.value}
          title={option.value === 'system' ? 'Follow the system appearance' : `${option.label} appearance`}
          onClick={() => pick(option.value)}
        >
          {option.icon ? <Icon name={option.icon} size={14} /> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Runs before paint so a dark-mode visitor never sees a white flash.
 * Inlined in the document head rather than shipped as a component.
 */
export const themeScript = `(function(){try{var c=localStorage.getItem('${KEY}');if(c==='dark'||c==='light'){document.documentElement.setAttribute('data-theme',c);}}catch(e){}})();`;
