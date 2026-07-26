cat << 'ROUTE_EOF' > new_route.ts

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
ROUTE_EOF

sed -i '/app.get("\/api\/contacts"/r new_route.ts' server.ts
