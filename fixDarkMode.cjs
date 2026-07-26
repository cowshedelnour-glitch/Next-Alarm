const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Fix malformed className string
content = content.replace(/className=\{`min-h-screen font-sans flex flex-col \$\{isDarkMode \? "dark bg-slate-900 text-slate-100" : "bg-\[#f8fafc\] text-\[#1e293b\]"\}` font-sans flex flex-col" dir="rtl">/g, 'className={`min-h-screen font-sans flex flex-col ${isDarkMode ? "dark bg-slate-900 text-slate-100" : "bg-[#f8fafc] text-[#1e293b]"}`} dir="rtl">');

// Add isDarkMode state and icon imports
if (!content.includes('isDarkMode')) {
  content = content.replace(/const \[alarmChatId, setAlarmChatId\] = useState\(''\);/, `const [alarmChatId, setAlarmChatId] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  
  useEffect(() => {
    localStorage.setItem('darkMode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);`);
}

// Add Moon and Sun to icons
if (!content.includes('Moon, Sun')) {
  content = content.replace(/import { ([^}]+) } from 'lucide-react';/, (match, icons) => {
    if (!icons.includes('Moon')) {
      return `import { ${icons}, Moon, Sun } from 'lucide-react';`;
    }
    return match;
  });
}

// Add Dark mode toggle button
if (!content.includes('onClick={() => setIsDarkMode(!isDarkMode)}')) {
  const toggleBtn = `
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="flex items-center justify-center w-8 h-8 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shrink-0 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              title="تغيير المظهر"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
  `;
  content = content.replace(/<button \n              onClick=\{.*?window.open/, toggleBtn + '<button \n              onClick={() => window.open');
}

fs.writeFileSync('src/App.tsx', content);
