import React, { useState, useEffect } from 'react';
import { Alarm, Contact } from './types';
import { Bell, Plus, Trash2, Clock, Users, MessageCircle, AlertCircle, CheckCircle2, Phone, Save, ExternalLink, Edit, X, Search, Filter, Moon, Sun , BellRing, ServerCrash, AlertTriangle, Calendar, RefreshCw} from 'lucide-react';
import { format, isToday, isTomorrow, addDays, isBefore } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function App() {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
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
  }, [isDarkMode]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [deletingAlarmId, setDeletingAlarmId] = useState<string | null>(null);
  const [retryingAlarmId, setRetryingAlarmId] = useState<string | null>(null);
  const [alarmToDelete, setAlarmToDelete] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');

  // Form State
  const [message, setMessage] = useState('');
  
  // Date State
  const [date, setDate] = useState('');
  
  // Time State
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly'>('none');
  
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [manualChatIds, setManualChatIds] = useState('');

  // Contact Form State
  const [contactName, setContactName] = useState('');
  const [contactChatId, setContactChatId] = useState('');

  // Edit Alarm State
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editRepeat, setEditRepeat] = useState<'none' | 'daily' | 'weekly'>('none');
  const [editSelectedContacts, setEditSelectedContacts] = useState<string[]>([]);
  const [editManualChatIds, setEditManualChatIds] = useState('');

  
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission('unsupported');
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('متصفحك لا يدعم الإشعارات');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  useEffect(() => {
    if (notificationPermission !== 'granted') return;

    const timeouts: NodeJS.Timeout[] = [];
    const now = Date.now();

    alarms.forEach(alarm => {
      if (!alarm.active) return;
      const alarmTime = new Date(alarm.time).getTime();
      const timeUntilAlarm = alarmTime - now;

      // Only schedule local notifications for alarms in the future, up to 24 hours
      if (timeUntilAlarm > 0 && timeUntilAlarm <= 86400000) {
        const timeout = setTimeout(() => {
          new Notification('تنبيه من فريق العمل', {
            body: alarm.message
          });
          // Also try to play a sound if possible (optional)
          fetchAlarms(); // refresh to update active status
        }, timeUntilAlarm);
        timeouts.push(timeout);
      }
    });

    return () => {
      timeouts.forEach(t => clearTimeout(t));
    };
  }, [alarms, notificationPermission]);

  const openEditModal = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setEditMessage(alarm.message);
    setEditRepeat(alarm.repeat || 'none');
    
    const d = new Date(alarm.time);
    const formattedDate = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    setEditDate(formattedDate);
    const formattedTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    setEditTime(formattedTime);

    // Map chatIds to selectedContacts and manualChatIds
    // ChatIds that match a contact are selected contacts, others are manual
    const knownContactChatIds = contacts.map(c => c.chatId);
    const selectedIds = alarm.chatIds
      .filter(chatId => knownContactChatIds.includes(chatId))
      .map(chatId => contacts.find(c => c.chatId === chatId)?.id)
      .filter(id => id !== undefined) as string[];
    
    const manualIds = alarm.chatIds.filter(chatId => !knownContactChatIds.includes(chatId));
    
    setEditSelectedContacts(selectedIds);
    setEditManualChatIds(manualIds.join(', '));
  };

  const handleUpdateAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAlarm || !editMessage || !editDate || !editTime || (editSelectedContacts.length === 0 && !editManualChatIds)) return;

    const dateTimeStr = `${editDate}T${editTime}:00`;
    const dateTime = new Date(dateTimeStr);
    
    const manualIds = editManualChatIds.split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
      
    const invalidIds = manualIds.filter(id => id.startsWith('+') || id.startsWith('00') || (id.startsWith('0') && id.length > 9));
    if (invalidIds.length > 0) {
      alert("بعض معرفات تليجرام الإضافية التي أدخلتها تبدو كأرقام هواتف. يرجى إدخال Chat ID صحيح لتليجرام.");
      return;
    }

    const selectedContactChatIds = editSelectedContacts
      .map(id => contacts.find(c => c.id === id)?.chatId)
      .filter(p => p !== undefined) as string[];

    const allChatIds = Array.from(new Set([...manualIds, ...selectedContactChatIds]));

    try {
      const res = await fetch(`/api/alarms/${editingAlarm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time: dateTime.toISOString(),
          message: editMessage,
          chatIds: allChatIds,
          repeat: editRepeat,
          active: true // Reactivate it on update
        })
      });

      if (res.ok) {
        setEditingAlarm(null);
        fetchAlarms();
      } else {
        const err = await res.json();
        alert(err.error || "فشل تحديث التنبيه");
      }
    } catch (error) {
      console.error('Error updating alarm:', error);
      alert('حدث خطأ أثناء الاتصال بالخادم');
    }
  };

  useEffect(() => {
    fetchAlarms();
    fetchContacts();
    
    // Poll for updates (e.g. status changes or sending failures)
    const interval = setInterval(() => {
      fetchAlarms(true);
    }, 15000); // every 15s
    
    return () => clearInterval(interval);
  }, []);

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (error) {
      console.error('Error fetching contacts:', error);
    }
  };

  const fetchAlarms = async (hideLoading = false) => {
    try {
      const res = await fetch('/api/alarms');
      if (res.ok) {
        const data = await res.json();
        setAlarms(data);
        setConnectionError(null);
      } else {
        setConnectionError('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
      }
    } catch (error) {
      console.error('Error fetching alarms:', error);
      setConnectionError('تعذر الوصول إلى الخلفية (Background Service). تأكد من أن الخادم قيد التشغيل.');
    } finally {
      if (!hideLoading) setLoading(false);
    }
  };
  const handleAddAlarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message || !date || !time || (selectedContacts.length === 0 && !manualChatIds)) return;

    const dateTimeStr = `${date}T${time}:00`;
    const dateTime = new Date(dateTimeStr);
    
    // Split manual chat IDs and add to selected contacts
    const manualIds = manualChatIds.split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
      
    const invalidIds = manualIds.filter(id => id.startsWith('+') || id.startsWith('00') || (id.startsWith('0') && id.length > 9));
    if (invalidIds.length > 0) {
      alert("بعض معرفات تليجرام الإضافية التي أدخلتها تبدو كأرقام هواتف. يرجى إدخال Chat ID صحيح لتليجرام.");
      return;
    }

    // Map selected contact IDs to their chat IDs
    const selectedContactChatIds = selectedContacts
      .map(id => contacts.find(c => c.id === id)?.chatId)
      .filter(p => p !== undefined) as string[];

    const allChatIds = Array.from(new Set([...manualIds, ...selectedContactChatIds]));

    try {
      const res = await fetch('/api/alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time: dateTime.toISOString(),
          message,
          chatIds: allChatIds,
          repeat
        })
      });

      if (res.ok) {
        // Reset form and refetch
        setMessage('');
        setDate('');
        setTime('');
        setRepeat('none');
        setManualChatIds('');
        setSelectedContacts([]);
        fetchAlarms();
      } else {
        alert("فشل في حفظ التنبيه");
      }
    } catch (error) {
      console.error('Error saving alarm:', error);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    }
  };

  const setDateShortcut = (type: 'today' | 'tomorrow' | 'nextWeek') => {
    const d = new Date();
    if (type === 'tomorrow') d.setDate(d.getDate() + 1);
    if (type === 'nextWeek') d.setDate(d.getDate() + 7);
    
    const formattedDate = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    setDate(formattedDate);
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactChatId) return;

    if (contactChatId.trim().startsWith('+') || contactChatId.trim().startsWith('00') || (contactChatId.trim().startsWith('0') && contactChatId.trim().length > 9)) {
      alert("Chat ID الذي أدخلته يبدو وكأنه رقم هاتف. يرجى إدخال Chat ID الصحيح الخاص بتليجرام (رقم داخلي). لمعرفته، أرسل رسالة إلى البوت @userinfobot.");
      return;
    }

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          chatId: contactChatId
        })
      });

      if (res.ok) {
        setContactName('');
        setContactChatId('');
        fetchContacts();
      }
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  };

  const confirmDeleteContact = async (id: string) => {
    if (deletingContactId) return;
    setDeletingContactId(id);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchContacts();
        setSelectedContacts(prev => prev.filter(cId => cId !== id));
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
    } finally {
      setDeletingContactId(null);
    }
  };
  const confirmDeleteAlarm = async (id: string) => {
    if (deletingAlarmId) return;
    setDeletingAlarmId(id);
    try {
      const res = await fetch(`/api/alarms/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchAlarms();
      }
    } catch (error) {
      console.error('Error deleting alarm:', error);
    } finally {
      setDeletingAlarmId(null);
    }
  };

  const handleRetryAlarm = async (id: string) => {
    if (retryingAlarmId) return;
    setRetryingAlarmId(id);
    try {
      const res = await fetch(`/api/alarms/${id}/retry`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchAlarms();
      } else {
        alert("فشل في إعادة المحاولة");
      }
    } catch (error) {
      console.error('Error retrying alarm:', error);
      alert("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setRetryingAlarmId(null);
    }
  };

  const groupedAlarms = {
    today: [] as Alarm[],
    tomorrow: [] as Alarm[],
    next7Days: [] as Alarm[],
    later: [] as Alarm[],
    past: [] as Alarm[]
  };

  const now = new Date();
  const nextWeek = addDays(now, 7);

  const filteredAlarms = alarms.filter(alarm => {
    const matchesSearch = alarm.message.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesFilter = true;
    const alarmDate = new Date(alarm.time);
    const isPast = alarmDate.getTime() < now.getTime();
    
    if (filterType === 'active') {
      matchesFilter = alarm.active && !isPast;
    } else if (filterType === 'past') {
      matchesFilter = !alarm.active || isPast;
    } else if (filterType === 'daily') {
      matchesFilter = alarm.repeat === 'daily';
    } else if (filterType === 'weekly') {
      matchesFilter = alarm.repeat === 'weekly';
    }

    return matchesSearch && matchesFilter;
  });

  filteredAlarms.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  filteredAlarms.forEach(alarm => {
    const d = new Date(alarm.time);
    const isPastAlarm = d.getTime() < now.getTime();
    
    if (isPastAlarm) {
      groupedAlarms.past.unshift(alarm); // Add to beginning so most recent past is first
    } else if (isToday(d)) {
      groupedAlarms.today.push(alarm);
    } else if (isTomorrow(d)) {
      groupedAlarms.tomorrow.push(alarm);
    } else if (isBefore(d, nextWeek)) {
      groupedAlarms.next7Days.push(alarm);
    } else {
      groupedAlarms.later.push(alarm);
    }
  });

  const renderAlarmCard = (alarm: Alarm) => {
    const alarmDate = new Date(alarm.time);
    const isPast = alarmDate.getTime() < Date.now();
    return (
      <div 
        key={alarm.id} 
        className={`p-4 rounded-2xl border flex flex-col gap-4 transition-colors ${
          !alarm.active || isPast ? 'bg-slate-50 border-slate-100 opacity-70 dark:bg-slate-800/50 dark:border-slate-700/50' : 'bg-white border-slate-200 shadow-sm dark:bg-slate-800 dark:border-slate-700'
        }`}
      >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto overflow-hidden">
          <div className="text-xl sm:text-2xl font-black text-slate-800 shrink-0 dark:text-slate-100">
            {format(alarmDate, 'HH:mm')}
          </div>
          <div className="w-[1px] h-8 bg-slate-200 shrink-0 dark:bg-slate-600"></div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm text-slate-700 truncate dark:text-slate-200">
              {alarm.message}
              {alarm.repeat === 'daily' && <span className="mr-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full inline-block shrink-0">يومياً</span>}
              {alarm.repeat === 'weekly' && <span className="mr-2 text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full inline-block shrink-0">أسبوعياً</span>}
            </p>
            <p className="text-xs text-slate-500 truncate dark:text-slate-400">
              {format(alarmDate, 'dd MMM yyyy', { locale: ar })} • {alarm.chatIds?.length || 0} مستلم
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 w-full sm:w-auto border-t sm:border-0 border-slate-100 pt-3 sm:pt-0 dark:border-slate-700">
          <span className={`text-xs px-2 py-1 rounded-md border ${
            !alarm.active || isPast ? 'bg-white border-slate-200 text-slate-500 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-400' : 'bg-green-50 border-green-100 text-green-700 font-medium dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400'
          }`}>
            {(!alarm.active || isPast) ? 'منتهي' : 'نشط'}
          </span>
          <button
            onClick={() => openEditModal(alarm)}
            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors dark:text-slate-500"
            title="تعديل التنبيه"
          >
            <Edit size={16} />
          </button>
          <button
            onClick={() => setAlarmToDelete(alarm.id)}
            disabled={deletingAlarmId === alarm.id}
            className={`p-1.5 rounded-lg transition-colors ${
              deletingAlarmId === alarm.id 
                ? 'text-slate-300 cursor-not-allowed dark:text-slate-600' 
                : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:text-slate-500 dark:hover:bg-red-900/20'
            }`}
            title="حذف التنبيه"
          >
            <Trash2 size={16} />
          </button>
        </div>
        </div>
        {alarm.error && (
          <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full dark:bg-red-900/10 dark:border-red-900/30 col-span-full">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-red-700 dark:text-red-400">حدث خطأ أثناء الإرسال:</p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">{alarm.error}</p>
              </div>
            </div>
            <button
              onClick={() => handleRetryAlarm(alarm.id)}
              disabled={retryingAlarmId === alarm.id}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors w-full sm:w-auto ${
                retryingAlarmId === alarm.id
                  ? 'bg-red-100 text-red-400 cursor-not-allowed dark:bg-red-900/20 dark:text-red-500'
                  : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50'
              }`}
            >
              <RefreshCw size={14} className={retryingAlarmId === alarm.id ? 'animate-spin' : ''} />
              {retryingAlarmId === alarm.id ? 'جاري...' : 'إعادة المحاولة'}
            </button>
          </div>
        )}
      </div>
    );
  };

return (
    <div className={`min-h-screen font-sans flex flex-col ${isDarkMode ? "dark bg-slate-900 text-slate-100" : "bg-[#f8fafc] text-[#1e293b]"}`} dir="rtl">
      <div className="max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
        
        
        {connectionError && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3 shadow-sm dark:bg-red-900/20 dark:border-red-800/30">
            <div className="bg-red-100 p-2 rounded-lg text-red-600 shrink-0 dark:bg-red-900/50 dark:text-red-400">
              <ServerCrash size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-800 dark:text-red-400">فقدان الاتصال بالخادم</h3>
              <p className="text-xs text-red-600 mt-1 dark:text-red-300">{connectionError}</p>
              <ul className="text-[11px] text-red-500 mt-2 list-disc list-inside dark:text-red-400/80">
                <li>تحقق من اتصالك بالإنترنت.</li>
                <li>تأكد من عمل خدمة الخلفية (Background Service).</li>
                <li>إذا استمرت المشكلة، قم بتحديث الصفحة.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm gap-4 dark:bg-slate-800 dark:border-slate-700">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-indigo-500 to-blue-600 p-2.5 rounded-xl text-white shadow-lg shadow-blue-500/20">
              <Clock size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 to-blue-600 dark:from-indigo-400 dark:to-blue-400 uppercase" dir="ltr">
                Next Alarm
              </h1>
              <p className="text-xs text-slate-500 font-medium dark:text-slate-400 mt-0.5">نظام إدارة تنبيهات فريق العمل</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            
            
            {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
              <button 
                onClick={requestNotificationPermission}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors text-sm font-medium dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
                title="تفعيل إشعارات المتصفح"
              >
                <BellRing size={16} />
                <span className="hidden sm:inline">تفعيل الإشعارات</span>
              </button>
            )}
            {notificationPermission === 'granted' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg border border-green-200 text-sm font-medium dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" title="إشعارات المتصفح مفعلة">
                 <BellRing size={16} />
                 <span className="hidden sm:inline">الإشعارات مفعلة</span>
              </div>
            )}

            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="flex items-center justify-center w-8 h-8 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shrink-0 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
              title="تغيير المظهر"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
  <button 
              onClick={() => window.open(window.location.href, '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-xs font-medium shrink-0 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
              title="فتح في صفحة جديدة"
            >
              <ExternalLink size={14} />
              <span>نافذة جديدة</span>
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full border border-green-100 shrink-0">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs font-bold text-green-700">الحالة: متصل بالخدمة</span>
            </div>
          </div>
        </header>

        <main className="flex-1 grid grid-cols-1 lg:grid-cols-4 lg:grid-rows-[auto_1fr] gap-6">
          
          {/* Add Alarm Form */}
          <div className="lg:col-span-2 lg:row-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col dark:bg-slate-800 dark:border-slate-700">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="w-1 h-6 bg-[#25D366] rounded-full"></span>
                تنبيه جديد
              </h2>
            </div>
              
              <form onSubmit={handleAddAlarm} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5 dark:text-slate-300">
                    <MessageCircle size={16} className="text-slate-400 dark:text-slate-500" />
                    الرسالة
                  </label>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="مثال: تذكير باجتماع المبيعات..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all dark:bg-slate-800/50 dark:border-slate-700"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5 dark:text-slate-300">
                    <Users size={16} className="text-slate-400 dark:text-slate-500" />
                    المستلمون من فريق العمل
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {contacts.length === 0 ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">لا توجد حسابات مفضلة. أضفها من القائمة الجانبية.</span>
                    ) : (
                      contacts.map(contact => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => {
                            if (selectedContacts.includes(contact.id)) {
                              setSelectedContacts(selectedContacts.filter(id => id !== contact.id));
                            } else {
                              setSelectedContacts([...selectedContacts, contact.id]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                            selectedContacts.includes(contact.id) 
                              ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400' 
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {contact.name}
                        </button>
                      ))
                    )}
                  </div>
                  
                  <label className="block text-sm font-medium text-slate-600 mt-3 mb-1.5 flex items-center gap-1.5 dark:text-slate-300">
                    معرفات تليجرام إضافية (Chat IDs)
                  </label>
                  <input
                    type="text"
                    value={manualChatIds}
                    onChange={(e) => setManualChatIds(e.target.value)}
                    placeholder="مثال: 123456789 (اختياري)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all dark:bg-slate-800/50 dark:border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center justify-between dark:text-slate-300">
                      <span>التاريخ</span>
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => setDateShortcut('today')} className="flex-1 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition font-medium dark:bg-slate-700 dark:text-slate-200">اليوم</button>
                      <button type="button" onClick={() => setDateShortcut('tomorrow')} className="flex-1 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition font-medium dark:bg-slate-700 dark:text-slate-200">غداً</button>
                      <button type="button" onClick={() => setDateShortcut('nextWeek')} className="flex-1 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition font-medium dark:bg-slate-700 dark:text-slate-200">أسبوع</button>
                    </div>
                    <div className="relative flex items-center w-full">
                      <input
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        onClick={e => {
                          try {
                            if ('showPicker' in HTMLInputElement.prototype) {
                              e.currentTarget.showPicker();
                            }
                          } catch (err) {}
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        required
                      />
                      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm flex items-center justify-between dark:bg-slate-800/50 dark:border-slate-700 dark:text-white relative z-0">
                        <span className={date ? "" : "text-slate-400"} dir="ltr">
                          {date ? format(new Date(date), 'dd/MM/yyyy') : 'dd/mm/yyyy'}
                        </span>
                        <Calendar size={16} className="text-slate-400" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5 mt-8 md:mt-0 dark:text-slate-300">الوقت</label>
                    <div className="flex gap-2 items-center" dir="ltr">
                      <input
                        type="time"
                        value={time}
                        onChange={e => setTime(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-center focus:outline-none focus:border-[#25D366] dark:bg-slate-800/50 dark:border-slate-700 dark:text-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5 dark:text-slate-300">
                    <Clock size={16} className="text-slate-400 dark:text-slate-500" />
                    التكرار
                  </label>
                  <select 
                    value={repeat} 
                    onChange={e => setRepeat(e.target.value as 'none'|'daily'|'weekly')} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all dark:bg-slate-800/50 dark:border-slate-700"
                  >
                    <option value="none">لمرة واحدة فقط</option>
                    <option value="daily">يومياً</option>
                    <option value="weekly">أسبوعياً</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-medium py-3 rounded-xl transition-colors shadow-sm shadow-emerald-500/20 mt-2"
                >
                  حفظ وجدولة
                </button>
              </form>
          </div>

          {/* Dark Widget: Total Contacts */}
          <div className="col-span-1 row-span-1 bg-[#1e293b] rounded-3xl p-6 shadow-sm text-white flex flex-col justify-between dark:bg-slate-800">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                <Users size={20} className="text-slate-300" />
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">الأرقام المفضلة</span>
            </div>
            <div>
              <p className="text-4xl font-black">{contacts.length}</p>
              <p className="text-xs text-slate-400 mt-1 dark:text-slate-500">عضو مسجل في النظام</p>
            </div>
          </div>

          {/* White Widget: Active Alarms */}
          <div className="col-span-1 row-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between dark:bg-slate-800 dark:border-slate-700">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                <Clock size={20} />
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">تنبيهات مجدولة نشطة</span>
            </div>
            <div>
              <p className="text-4xl font-black text-slate-800 dark:text-slate-100">
                {alarms.filter(a => a.active && new Date(a.time).getTime() >= Date.now()).length}
              </p>
              <p className="text-xs text-green-600 mt-1">تنتظر الإرسال</p>
            </div>
          </div>

          {/* White Widget: Completed Alarms */}
          <div className="col-span-1 row-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between dark:bg-slate-800 dark:border-slate-700">
            <div className="flex justify-between items-start">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <CheckCircle2 size={20} />
              </div>
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500">تنبيهات مكتملة</span>
            </div>
            <div>
              <p className="text-4xl font-black text-slate-800 dark:text-slate-100">
                {alarms.filter(a => !a.active || new Date(a.time).getTime() < Date.now()).length}
              </p>
              <p className="text-xs text-blue-600 mt-1">تمت المعالجة والإرسال</p>
            </div>
          </div>

          {/* Contacts Management */}
          <div className="col-span-1 row-span-1 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col overflow-hidden h-[350px] lg:h-auto dark:bg-slate-800 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">فريق العمل ومعرفات تليجرام</h3>
            </div>
            
            <form onSubmit={handleAddContact} className="flex flex-col gap-2 mb-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="الاسم"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  className="w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#25D366] dark:bg-slate-800/50 dark:border-slate-700"
                  required
                />
                <input
                  type="text"
                  placeholder="Chat ID (ex: 123456789)"
                  value={contactChatId}
                  onChange={e => setContactChatId(e.target.value)}
                  className="w-2/3 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#25D366] dark:bg-slate-800/50 dark:border-slate-700"
                  required
                />
                <button type="submit" className="bg-slate-800 text-white p-1.5 rounded-lg hover:bg-slate-700">
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight dark:text-slate-400">
                * Chat ID هو رقم داخلي وليس رقم هاتف. لمعرفته، ابحث عن بوت <strong>@userinfobot</strong> في تليجرام وأرسل له رسالة.
              </p>
              <p className="text-[10px] text-red-500 font-bold leading-tight mt-1">
                * هام جداً: لن يتمكن البوت من إرسال تنبيهات لأي شخص إلا إذا قام هذا الشخص بالبحث عن البوت الخاص بك وإرسال رسالة له أولاً.
              </p>
            </form>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {contacts.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-4 dark:text-slate-500">لم يتم إضافة معرفات تليجرام بعد.</div>
              ) : (
                contacts.map(contact => (
                  <div key={contact.id} className="flex justify-between items-center bg-slate-50 border border-slate-100 p-2 rounded-xl dark:bg-slate-800/50 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0 dark:bg-slate-600 dark:text-slate-300">
                        {contact.name.charAt(0)}
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-700 truncate dark:text-slate-200">{contact.name}</p>
                        <p className="text-[10px] text-slate-500 truncate dark:text-slate-400" dir="ltr">{contact.chatId}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setContactToDelete(contact.id)}
                      disabled={deletingContactId === contact.id}
                      className={`p-1 transition-colors ${
                        deletingContactId === contact.id
                          ? 'text-slate-300 cursor-not-allowed dark:text-slate-600'
                          : 'text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400'
                      }`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Alarm List */}
          <div className="hidden lg:flex lg:col-span-4 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex-col overflow-hidden h-[500px] lg:h-[600px] dark:bg-slate-800 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="w-1 h-6 bg-[#25D366] rounded-full"></span>
                التنبيهات المجدولة
              </h2>
              <div className="flex gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="ابحث في التنبيهات..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all dark:bg-slate-800/50 dark:border-slate-700"
                  />
                </div>
                <div className="relative shrink-0">
                  <Filter size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="appearance-none bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all cursor-pointer dark:bg-slate-800/50 dark:border-slate-700"
                  >
                    <option value="all">الكل</option>
                    <option value="active">نشط</option>
                    <option value="past">منتهي</option>
                    <option value="daily">يومياً</option>
                    <option value="weekly">أسبوعياً</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="space-y-4 overflow-y-auto flex-1 pr-2 pb-2">
              {loading ? (
                <div className="text-center text-slate-400 py-6 dark:text-slate-500">جاري التحميل...</div>
              ) : alarms.length === 0 ? (
                <div className="bg-slate-50 rounded-2xl p-8 text-center border border-slate-100 border-dashed dark:bg-slate-800/50 dark:border-slate-700">
                  <h3 className="text-slate-600 font-medium mb-1 dark:text-slate-300">لا توجد تنبيهات</h3>
                  <p className="text-slate-400 text-sm dark:text-slate-500">قم بإضافة تنبيه جديد</p>
                </div>
              ) : filteredAlarms.length === 0 ? (
                <div className="bg-slate-50 rounded-2xl p-8 text-center border border-slate-100 border-dashed dark:bg-slate-800/50 dark:border-slate-700">
                  <h3 className="text-slate-600 font-medium mb-1 dark:text-slate-300">لا توجد نتائج</h3>
                  <p className="text-slate-400 text-sm dark:text-slate-500">لم يتم العثور على تنبيهات تطابق بحثك</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedAlarms.today.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-500 border-b pb-2 dark:text-slate-400">اليوم</h3>
                      {groupedAlarms.today.map(renderAlarmCard)}
                    </div>
                  )}
                  {groupedAlarms.tomorrow.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-500 border-b pb-2 dark:text-slate-400">غداً</h3>
                      {groupedAlarms.tomorrow.map(renderAlarmCard)}
                    </div>
                  )}
                  {groupedAlarms.next7Days.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-500 border-b pb-2 dark:text-slate-400">الأيام السبعة القادمة</h3>
                      {groupedAlarms.next7Days.map(renderAlarmCard)}
                    </div>
                  )}
                  {groupedAlarms.later.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-500 border-b pb-2 dark:text-slate-400">فيما بعد</h3>
                      {groupedAlarms.later.map(renderAlarmCard)}
                    </div>
                  )}
                  {groupedAlarms.past.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-bold text-slate-500 border-b pb-2 dark:text-slate-400">تنبيهات سابقة</h3>
                      {groupedAlarms.past.map(renderAlarmCard)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </main>
      </div>

      {alarmToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col dark:bg-slate-800">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-red-900/20">
                <Trash2 size={32} />
              </div>
              <h2 className="text-xl font-bold mb-2 dark:text-white">تأكيد الحذف</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                هل أنت متأكد من حذف هذا التنبيه؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setAlarmToDelete(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-xl transition-colors dark:bg-slate-700 dark:text-slate-200"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => {
                    confirmDeleteAlarm(alarmToDelete);
                    setAlarmToDelete(null);
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-xl transition-colors"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {contactToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl overflow-hidden flex flex-col dark:bg-slate-800">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 dark:bg-red-900/20">
                <Trash2 size={32} />
              </div>
              <h2 className="text-xl font-bold mb-2 dark:text-white">تأكيد الحذف</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6">
                هل أنت متأكد من حذف جهة الاتصال؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setContactToDelete(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-xl transition-colors dark:bg-slate-700 dark:text-slate-200"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => {
                    confirmDeleteContact(contactToDelete);
                    setContactToDelete(null);
                  }}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-xl transition-colors"
                >
                  تأكيد الحذف
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingAlarm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh] dark:bg-slate-800">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-700">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Edit size={20} className="text-[#25D366]" />
                تعديل التنبيه
              </h2>
              <button onClick={() => setEditingAlarm(null)} className="text-slate-400 hover:text-slate-600 transition-colors dark:text-slate-500">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="editAlarmForm" onSubmit={handleUpdateAlarm} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5 dark:text-slate-300">
                    <MessageCircle size={16} className="text-slate-400 dark:text-slate-500" />
                    الرسالة
                  </label>
                  <input
                    type="text"
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    placeholder="مثال: تذكير باجتماع المبيعات..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all dark:bg-slate-800/50 dark:border-slate-700"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5 dark:text-slate-300">
                    <Users size={16} className="text-slate-400 dark:text-slate-500" />
                    المستلمون من فريق العمل
                  </label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {contacts.length === 0 ? (
                      <span className="text-xs text-slate-400 dark:text-slate-500">لا توجد حسابات مفضلة. أضفها من القائمة الجانبية.</span>
                    ) : (
                      contacts.map(contact => (
                        <button
                          key={contact.id}
                          type="button"
                          onClick={() => {
                            setEditSelectedContacts(prev => 
                              prev.includes(contact.id) 
                                ? prev.filter(id => id !== contact.id)
                                : [...prev, contact.id]
                            )
                          }}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                            editSelectedContacts.includes(contact.id)
                              ? 'bg-[#25D366]/10 border-[#25D366] text-[#25D366] font-bold'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700'
                          }`}
                        >
                          {contact.name}
                        </button>
                      ))
                    )}
                  </div>
                  <input
                    type="text"
                    value={editManualChatIds}
                    onChange={(e) => setEditManualChatIds(e.target.value)}
                    placeholder="مثال: 123456789 (اختياري)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all dark:bg-slate-800/50 dark:border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center justify-between dark:text-slate-300">
                      <span>التاريخ</span>
                    </label>
                    <div className="relative flex items-center w-full">
                      <input
                        type="date"
                        value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        onClick={e => {
                          try {
                            if ('showPicker' in HTMLInputElement.prototype) {
                              e.currentTarget.showPicker();
                            }
                          } catch (err) {}
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        required
                      />
                      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm flex items-center justify-between dark:bg-slate-800/50 dark:border-slate-700 dark:text-white relative z-0">
                        <span className={editDate ? "" : "text-slate-400"} dir="ltr">
                          {editDate ? format(new Date(editDate), 'dd/MM/yyyy') : 'dd/mm/yyyy'}
                        </span>
                        <Calendar size={16} className="text-slate-400" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5 mt-8 md:mt-0 dark:text-slate-300">الوقت</label>
                    <div className="flex gap-2 items-center" dir="ltr">
                      <input
                        type="time"
                        value={editTime}
                        onChange={e => setEditTime(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-center focus:outline-none focus:border-[#25D366] dark:bg-slate-800/50 dark:border-slate-700 dark:text-white"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5 dark:text-slate-300">
                    <Clock size={16} className="text-slate-400 dark:text-slate-500" />
                    التكرار
                  </label>
                  <select 
                    value={editRepeat} 
                    onChange={e => setEditRepeat(e.target.value as 'none'|'daily'|'weekly')} 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366] transition-all dark:bg-slate-800/50 dark:border-slate-700"
                  >
                    <option value="none">لمرة واحدة فقط</option>
                    <option value="daily">يومياً</option>
                    <option value="weekly">أسبوعياً</option>
                  </select>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 flex gap-3 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setEditingAlarm(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-xl transition-colors dark:bg-slate-700 dark:text-slate-200"
              >
                إلغاء
              </button>
              <button
                type="submit"
                form="editAlarmForm"
                className="flex-1 bg-[#25D366] hover:bg-[#20bd5a] text-white font-medium py-3 rounded-xl transition-colors shadow-sm shadow-emerald-500/20"
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

