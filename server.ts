import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import schedule from "node-schedule";
import twilio from "twilio";
import dotenv from "dotenv";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, where } from 'firebase/firestore/lite';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Type definitions
interface Alarm {
  id: string;
  time: string; // ISO string
  message: string;
  chatIds: string[];
  active: boolean;
  repeat?: 'none' | 'daily' | 'weekly';
}

import fs from "fs";

// Firebase Setup
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
let config: any = {};
if (fs.existsSync(firebaseConfigPath)) {
  config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
}

const appFirebase = initializeApp(config);
const db = getFirestore(appFirebase, config.firestoreDatabaseId);

// Telegram Setup
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Execution Logic
async function executeAlarm(alarm: Alarm) {
  console.log(`Executing alarm ${alarm.id}!`);
  
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn("Telegram bot token not configured.");
    return;
  }

  let hasError = false;
  let errorMessage = "";

  for (const chatId of alarm.chatIds) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `⏰ تنبيه من فريق العمل:\n${alarm.message}`
        })
      });
      
      if (!response.ok) {
         const errText = await response.text();
         console.error(`Failed to send Telegram message to ${chatId}:`, errText);
         hasError = true;
         if (errText.includes('chat not found')) {
           errorMessage = `المعرف (${chatId}) غير موجود أو لم يقم المستلم ببدء محادثة مع البوت (/start) أولاً.`;
         } else if (errText.includes('bot was blocked')) {
           errorMessage = `قام المستلم صاحب المعرف (${chatId}) بحظر البوت.`;
         } else {
           errorMessage = `فشل الإرسال إلى المعرف (${chatId}): ${errText}`;
         }
      } else {
         console.log(`Sent Telegram message to ${chatId}`);
      }
    } catch (err) {
      console.error(`Failed to send Telegram message to ${chatId}:`, err);
      hasError = true;
      errorMessage = "فشل الاتصال بخدمة تليجرام";
    }
  }
  
  // Mark as inactive after triggering, or reschedule if repeating
  try {
    const updateData: any = {};
    if (hasError) {
      updateData.error = errorMessage;
    } else {
      updateData.error = null; // Clear previous errors
    }

    if (alarm.repeat === 'daily' || alarm.repeat === 'weekly') {
      const current = new Date(alarm.time);
      const now = new Date();
      // Keep adding until it's in the future
      while (current.getTime() <= now.getTime()) {
        if (alarm.repeat === 'daily') {
          current.setDate(current.getDate() + 1);
        } else if (alarm.repeat === 'weekly') {
          current.setDate(current.getDate() + 7);
        }
      }
      const newTimeStr = current.toISOString();
      updateData.time = newTimeStr;
      await updateDoc(doc(db, "alarms", alarm.id), updateData);
      console.log(`Rescheduled recurring alarm ${alarm.id} to ${newTimeStr}`);
      alarm.time = newTimeStr;
      scheduleAlarm(alarm);
    } else {
      updateData.active = false;
      await updateDoc(doc(db, "alarms", alarm.id), updateData);
    }
  } catch (error) {
    console.error(`Failed to update alarm ${alarm.id} status in Firestore:`, error);
  }
}

// Scheduling Logic
function scheduleAlarm(alarm: Alarm) {
  const date = new Date(alarm.time);
  
  // If it's in the past and still active, execute immediately (catch up for missed alarms while sleeping)
  if (date.getTime() <= Date.now()) {
    console.log(`Alarm ${alarm.id} is in the past. Executing immediately to catch up.`);
    executeAlarm(alarm);
    return;
  }

  console.log(`Scheduling alarm ${alarm.id} for ${date.toISOString()}`);
  schedule.scheduleJob(alarm.id, date, async () => {
    await executeAlarm(alarm);
  });
}

// Cron API Endpoint (for external pinging)
app.get("/api/cron", async (req, res) => {
  try {
    const q = query(collection(db, "alarms"), where("active", "==", true));
    const snapshot = await getDocs(q);
    
    let processed = 0;
    const now = Date.now();
    
    snapshot.forEach((docSnapshot) => {
      const alarm = { id: docSnapshot.id, ...docSnapshot.data() } as Alarm;
      if (new Date(alarm.time).getTime() <= now) {
        executeAlarm(alarm);
        processed++;
      }
    });
    
    res.json({ status: "ok", message: `Cron executed successfully. Processed ${processed} missed/due alarms.` });
  } catch (error) {
    console.error("Cron failed:", error);
    res.status(500).json({ error: "Failed to run cron" });
  }
});

// API Routes
app.get("/api/alarms", async (req, res) => {
  try {
    const snapshot = await getDocs(collection(db, "alarms"));
    const alarmsList: Alarm[] = [];
    snapshot.forEach((docSnapshot) => {
      alarmsList.push({ id: docSnapshot.id, ...docSnapshot.data() } as Alarm);
    });
    res.json(alarmsList.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()));
  } catch (error) {
    console.error("Error fetching alarms:", error);
    res.status(500).json({ error: "Failed to fetch alarms" });
  }
});

app.post("/api/alarms", async (req, res) => {
  const { time, message, chatIds, repeat } = req.body;
  if (!time || !message || !chatIds || chatIds.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const alarmData: Omit<Alarm, "id"> = {
    time,
    message,
    chatIds,
    active: true,
    repeat: repeat || 'none',
  };

  try {
    const docRef = await addDoc(collection(db, "alarms"), alarmData);
    const newAlarm: Alarm = {
      id: docRef.id,
      ...alarmData,
    };

    scheduleAlarm(newAlarm);
    res.status(201).json(newAlarm);
  } catch (error) {
    console.error("Error adding alarm:", error);
    res.status(500).json({ error: "Failed to save alarm" });
  }
});

app.delete("/api/alarms/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    await deleteDoc(doc(db, "alarms", id));
    
    // Cancel the scheduled job if it exists
    const job = schedule.scheduledJobs[id];
    if (job) {
      job.cancel();
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting alarm:", error);
    res.status(500).json({ error: "Failed to delete alarm" });
  }
});

app.put("/api/alarms/:id", async (req, res) => {
  const { id } = req.params;
  const { time, message, chatIds, repeat, active } = req.body;

  if (!time || !message || !chatIds || chatIds.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const updateData: any = {
    time,
    message,
    chatIds,
    repeat: repeat || 'none',
  };

  if (typeof active === 'boolean') {
    updateData.active = active;
  }

  try {
    await updateDoc(doc(db, "alarms", id), updateData);

    // Cancel the old scheduled job
    const job = schedule.scheduledJobs[id];
    if (job) {
      job.cancel();
    }

    // Schedule the updated alarm if it's active and in the future
    const updatedAlarm: Alarm = { id, active: updateData.active ?? true, ...updateData };
    if (updatedAlarm.active) {
       scheduleAlarm(updatedAlarm);
    }

    res.status(200).json(updatedAlarm);
  } catch (error) {
    console.error("Error updating alarm:", error);
    res.status(500).json({ error: "Failed to update alarm" });
  }
});

app.get("/api/contacts", async (req, res) => {

app.post("/api/alarms/:id/retry", async (req, res) => {
  const { id } = req.params;
  try {
    const { getDoc } = await import("firebase/firestore/lite");
    const docRef = doc(db, "alarms", id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return res.status(404).json({ error: "Alarm not found" });
    }
    const alarm = { id: docSnap.id, ...docSnap.data() } as Alarm;
    await executeAlarm(alarm);
    
    // Fetch updated alarm
    const updatedSnap = await getDoc(docRef);
    const updatedAlarm = { id: updatedSnap.id, ...updatedSnap.data() } as Alarm;
    res.json(updatedAlarm);
  } catch (error) {
    console.error("Error retrying alarm:", error);
    res.status(500).json({ error: "Failed to retry alarm" });
  }
});
  try {
    const snapshot = await getDocs(collection(db, "contacts"));
    const contactsList: any[] = [];
    snapshot.forEach((docSnapshot) => {
      contactsList.push({ id: docSnapshot.id, ...docSnapshot.data() });
    });
    res.json(contactsList);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

app.post("/api/contacts", async (req, res) => {
  const { name, chatId } = req.body;
  if (!name || !chatId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const contactData = { name, chatId };
    const docRef = await addDoc(collection(db, "contacts"), contactData);
    res.status(201).json({ id: docRef.id, ...contactData });
  } catch (error) {
    console.error("Error adding contact:", error);
    res.status(500).json({ error: "Failed to save contact" });
  }
});

app.delete("/api/contacts/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await deleteDoc(doc(db, "contacts", id));
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

async function startServer() {
  // Load existing alarms from Firestore and reschedule
  try {
    const q = query(collection(db, "alarms"), where("active", "==", true));
    const alarmsSnapshot = await getDocs(q);
    let count = 0;
    alarmsSnapshot.forEach(docSnapshot => {
      const alarm = { id: docSnapshot.id, ...docSnapshot.data() } as Alarm;
      scheduleAlarm(alarm);
      count++;
    });
    console.log(`Loaded and scheduled ${count} active alarms from Firestore`);
  } catch (error) {
    console.error("Failed to load alarms from Firestore on startup:", error);
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
