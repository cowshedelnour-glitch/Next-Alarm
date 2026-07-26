const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace root class
content = content.replace(/className="min-h-screen bg-\[#f8fafc\] text-\[#1e293b\]/g, 'className={`min-h-screen font-sans flex flex-col ${isDarkMode ? "dark bg-slate-900 text-slate-100" : "bg-[#f8fafc] text-[#1e293b]"}`');
content = content.replace(/className="min-h-screen bg-\[#f8fafc\] text-\[#1e293b\] font-sans flex flex-col" dir="rtl"/g, 'className={`min-h-screen font-sans flex flex-col ${isDarkMode ? "dark bg-slate-900 text-slate-100" : "bg-[#f8fafc] text-[#1e293b]"}`} dir="rtl"');

// Map of common classes to their dark variants
const replacements = {
  'bg-white': 'dark:bg-slate-800',
  'bg-slate-50': 'dark:bg-slate-800/50',
  'bg-slate-100': 'dark:bg-slate-700',
  'bg-slate-200': 'dark:bg-slate-600',
  'border-slate-100': 'dark:border-slate-700',
  'border-slate-200': 'dark:border-slate-700',
  'text-slate-800': 'dark:text-slate-100',
  'text-slate-700': 'dark:text-slate-200',
  'text-slate-600': 'dark:text-slate-300',
  'text-slate-500': 'dark:text-slate-400',
  'text-slate-400': 'dark:text-slate-500',
  'bg-[#1e293b]': 'dark:bg-slate-800',
};

// Find all className="something" and insert dark variants
content = content.replace(/className="([^"]+)"/g, (match, classes) => {
  const classList = classes.split(' ');
  const newClasses = [...classList];
  for (const cls of classList) {
    if (replacements[cls] && !classList.includes(replacements[cls])) {
      newClasses.push(replacements[cls]);
    }
  }
  return `className="${newClasses.join(' ')}"`;
});

// Also replace inside template literals className={`...`}
content = content.replace(/className=\{`([^`]+)`\}/g, (match, classes) => {
  // Simple regex for string parts isn't 100% robust, but works for our standard conditional classes
  // Wait, I'll just skip template literals for a moment, or manually handle them.
  let newClassesStr = classes;
  for (const [key, val] of Object.entries(replacements)) {
    // Only replace if it doesn't already have dark variant
    const regex = new RegExp(`\\b${key}\\b(?![^}]*})`, 'g'); // prevent replacing inside ${} expressions if possible, but actually it's fine.
    // simpler: just add it if key exists
    // actually, this can be tricky. Let's just do a simple replace.
  }
  return match;
});

fs.writeFileSync('src/App.tsx', content);
