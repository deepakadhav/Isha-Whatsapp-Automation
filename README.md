# 🛡️ Ishangam Call Campaign WhatsApp Automation (Anti-Ban Safe Edition v2.1.0)

This script automates sending WhatsApp messages, marking call outcomes, entering remarks, and continuously processing leads on **Ishangam Call Campaign** (`ishangam.isha.in`) with robust anti-ban protections and dynamic run control.

---

## 🌟 What's New in v2.1.0

1. **🎯 Dynamic Max Messages Limit (e.g. 30 Messages Run)**:
   - Set the exact number of messages to send on any run (e.g., `30`, `50`, or `0` for unlimited) directly in the UI widget.
   - The loop tracks progress in real-time (`Sent: 12 / 30`) and **automatically halts** once the target is reached.
   - Includes a quick `🔄` reset button to restart the counter whenever needed.

2. **⏳ Randomized 10s to 3-Minute Humanized Gaps**:
   - Random interval between **10 seconds and 180 seconds (3 minutes)** between each message to eliminate robotic patterns and prevent WhatsApp detection.
   - Live countdown display formatted clearly in minutes & seconds (e.g., `🟢 Sending next lead in 2m 15s (12/30)`).
   - Delay range is fully adjustable directly from the UI toolbar.

3. **🛡️ Complete Anti-Ban Suite**:
   - **Contact Name Personalization**: Automatically prepends the lead's name (`Namaskaram [Name]! 🙏`) to make every outgoing message unique.
   - **Batch Cooldown Breathers**: Automatic 3-minute cooldown every 10 messages.
   - **Single WhatsApp Tab Reuse**: Direct cross-tab communication avoids opening dozens of browser tabs.
   - **Delivery Confirmation Handshake**: Automatically confirms delivery before moving to the next lead.

---

## 🚀 Quick Start & Usage

1. Open **[ishangam.isha.in/call_campaign](https://ishangam.isha.in/call_campaign/)** with Tampermonkey / Violentmonkey enabled.
2. In the floating bottom-right control widget:
   - Set **🎯 Max Limit** (default: `30`).
   - Set **⏳ Delay Range** (default: `10` to `180` sec).
3. Click **`▶️ Start Safe Auto Loop`**.
4. The script will open WhatsApp Web, send the personalized message, record the outcome, and pace through up to your set target limit before stopping automatically!

---

## ⚙️ Configuration Defaults

Inside [`ishangam_whatsapp_automation.user.js`](file:///e:/Isha/Whatsapp%20Automation/ishangam_whatsapp_automation.user.js#L20-L40):
```javascript
const CONFIG = {
    defaultRemark: "whatsapp send",
    autoSendWhatsAppWeb: true,   // Set false for manual send button clicking
    autoCloseWhatsAppTab: false, // Keep 1 single WhatsApp tab open
    
    // Anti-Ban Dynamic Delays (10s to 3 min)
    defaultMinDelaySec: 10,      // Minimum 10 seconds between messages
    defaultMaxDelaySec: 180,     // Maximum 3 minutes (180s) between messages
    
    // Dynamic Max Send Limit per Run
    defaultMaxMessages: 30,      // Stop after 30 messages (0 = unlimited)
    
    // Anti-Ban Batch Cooldowns
    batchSize: 10,               // Cooldown break every 10 messages
    batchCooldownMs: 180000,     // 3-minute break between batches
};
```
