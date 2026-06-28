// sms-manager.js - SMSManager Class to handle SMS configuration and sending
class SMSManager {
  constructor(app) {
    this.app = app;
  }

  get smsMode() { return this.app.smsMode; }
  set smsMode(val) { this.app.smsMode = val; }
  get smsApiKey() { return this.app.smsApiKey; }
  set smsApiKey(val) { this.app.smsApiKey = val; }
  get smsDeviceId() { return this.app.smsDeviceId; }
  set smsDeviceId(val) { this.app.smsDeviceId = val; }
  get smsTemplateIn() { return this.app.smsTemplateIn; }
  set smsTemplateIn(val) { this.app.smsTemplateIn = val; }
  get smsTemplateOut() { return this.app.smsTemplateOut; }
  set smsTemplateOut(val) { this.app.smsTemplateOut = val; }

  initSmsSettings() {
    const smsModeSelect = document.getElementById("smsModeSelect");
    const smsGatewaySettings = document.getElementById("smsGatewaySettings");
    const smsGatewayApiKey = document.getElementById("smsGatewayApiKey");
    const smsGatewayDeviceId = document.getElementById("smsGatewayDeviceId");
    const smsTemplateIn = document.getElementById("smsTemplateIn");
    const smsTemplateOut = document.getElementById("smsTemplateOut");
    const btnSaveSmsSettings = document.getElementById("btnSaveSmsSettings");

    if (!smsModeSelect) return;

    // Set initial values
    smsModeSelect.value = this.smsMode;
    smsGatewayApiKey.value = this.smsApiKey;
    smsGatewayDeviceId.value = this.smsDeviceId;
    smsTemplateIn.value = this.smsTemplateIn;
    smsTemplateOut.value = this.smsTemplateOut;

    // Toggle gateway fields based on mode
    const toggleGatewayFields = () => {
      if (smsModeSelect.value === "auto") {
        smsGatewaySettings.style.display = "block";
      } else {
        smsGatewaySettings.style.display = "none";
      }
    };
    toggleGatewayFields();

    smsModeSelect.addEventListener("change", toggleGatewayFields);

    btnSaveSmsSettings.onclick = (e) => {
      e.preventDefault();
      this.smsMode = smsModeSelect.value;
      this.smsApiKey = smsGatewayApiKey.value.trim();
      this.smsDeviceId = smsGatewayDeviceId.value.trim();
      this.smsTemplateIn = smsTemplateIn.value.trim();
      this.smsTemplateOut = smsTemplateOut.value.trim();
      
      this.app.saveState();
      alert("문자 발송 설정이 안전하게 저장되었습니다!");
    };
  }

  sendSmsNotification(student, type, timeVal) {
    if (this.smsMode === "none") return;

    // 1. Get phone number
    const memberRec = this.app.state.memberAnalysis.find(m => m.name.trim() === student.name.trim());
    const phone = memberRec ? (memberRec.phone || "").trim() : "";
    if (!phone) {
      console.log(`[SMS] ${student.name} 학생의 학부모 연락처가 등록되지 않아 문자를 발송할 수 없습니다.`);
      return;
    }

    // Clean phone number
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 9) {
      console.log(`[SMS] 유효하지 않은 전화번호 형식입니다: ${phone}`);
      return;
    }

    // Format timeVal (e.g. "15:30" -> "15시30분")
    let formattedTime = timeVal || "";
    if (formattedTime.includes(":")) {
      const timeParts = formattedTime.split(":");
      if (timeParts.length === 2) {
        const hrs = parseInt(timeParts[0], 10);
        const mins = parseInt(timeParts[1], 10);
        formattedTime = `${hrs}시${mins}분`;
      }
    }

    // 2. Prepare message content
    const template = type === "in" ? this.smsTemplateIn : this.smsTemplateOut;
    const message = template
      .replace(/{name}/g, student.name)
      .replace(/{time}/g, formattedTime);

    console.log(`[SMS Send] To: ${cleanPhone}, Message: ${message}`);

    if (this.smsMode === "click") {
      // Option A: One-click mobile sms URL
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      let smsUrl = `sms:${cleanPhone}`;
      if (isMobile) {
        const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?";
        smsUrl += `${separator}body=${encodeURIComponent(message)}`;
      } else {
        smsUrl += `?body=${encodeURIComponent(message)}`;
      }
      window.open(smsUrl, "_blank");
    } else if (this.smsMode === "auto") {
      // Option B: Textbee Android SMS Gateway API
      if (!this.smsApiKey || !this.smsDeviceId) {
        alert("Textbee 자동 문자 발송 설정(API Key, Device ID)이 누락되었습니다!");
        return;
      }

      fetch(`https://api.textbee.dev/api/v1/gateway/devices/${this.smsDeviceId}/send-sms`, {
        method: "POST",
        headers: {
          "x-api-key": this.smsApiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipients: [cleanPhone],
          message: message
        })
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        console.log("[SMS Auto Sent Successfully]", data);
      })
      .catch(err => {
        console.error("Textbee SMS 발송 오류: ", err);
      });
    }
  }

  getNextTextbook(currentTitle) {
    if (!currentTitle) return "";
    currentTitle = currentTitle.trim();
    
    const directMap = {
      "훈민정음 1-1": "훈민정음 1-2",
      "훈민정음 1-2": "훈민정음 1-3",
      "훈민정음 1-3": "훈민정음 2-1",
      "훈민정음 2-1": "훈민정음 2-2",
      "훈민정음 2-2": "훈민정음 2-3",
      "훈민정음 2-3": "훈민정음 3-1",
      "훈민정음 3-1": "훈민정음 3-2",
      "훈민정음 3-2": "독트 1단계",
      "독트 1단계": "독트 2단계",
      "독트 2단계": "독트 3단계",
      "독트 3단계": "독트 4단계",
      "독트 4단계": "독트 5단계"
    };

    if (directMap[currentTitle]) {
      return directMap[currentTitle];
    }

    const xyRegex = /^(.*?)\s*(\d+)-(\d+)$/;
    const xyMatch = currentTitle.match(xyRegex);
    if (xyMatch) {
      const prefix = xyMatch[1];
      const x = parseInt(xyMatch[2], 10);
      const y = parseInt(xyMatch[3], 10);
      if (y < 3) {
        return `${prefix} ${x}-${y + 1}`;
      } else {
        return `${prefix} ${x + 1}-1`;
      }
    }

    const stageRegex = /^(.*?)\s*(\d+)(단계|권|부|탄)?$/;
    const stageMatch = currentTitle.match(stageRegex);
    if (stageMatch) {
      const prefix = stageMatch[1];
      const num = parseInt(stageMatch[2], 10);
      const suffix = stageMatch[3] || "";
      return `${prefix} ${num + 1}${suffix}`;
    }

    return currentTitle + " 다음 단계";
  }

  showSmsPreviewModal(studentName, completedTitle, nextTitle) {
    const memberRec = this.app.state.memberAnalysis.find(m => m.name.trim() === studentName.trim());
    const phone = memberRec ? (memberRec.phone || "").trim() : "";
    
    const message = `[생각나래] ${studentName} 학생이 교재 [${completedTitle}] 학습을 잘 완료했습니다. 다음 교재인 [${nextTitle}]를 준비해서 보내주시기 바랍니다.`;
    
    const modal = document.getElementById("modalSmsPreview");
    const phoneInput = document.getElementById("smsPreviewPhone");
    const textInput = document.getElementById("smsPreviewText");
    
    if (!modal || !phoneInput || !textInput) return;
    
    phoneInput.value = phone;
    textInput.value = message;
    
    modal.classList.add("active");
    
    const closeBtn = document.getElementById("btnCloseSmsPreviewModal");
    const cancelBtn = document.getElementById("btnCancelSmsPreviewModal");
    const form = document.getElementById("formSmsPreview");
    
    const closeModal = () => {
      modal.classList.remove("active");
    };
    
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;
    
    form.onsubmit = (e) => {
      e.preventDefault();
      const finalPhone = phoneInput.value.trim();
      const finalMessage = textInput.value.trim();
      
      this.sendDirectSms(finalPhone, finalMessage);
      closeModal();
    };
  }

  sendDirectSms(phone, message) {
    if (this.smsMode === "none") {
      alert("문자 발송 모드가 '발송 안 함'으로 설정되어 있습니다.");
      return;
    }
    
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.length < 9) {
      alert("유효하지 않은 수신인 번호입니다.");
      return;
    }
    
    console.log(`[SMS Direct Send] To: ${cleanPhone}, Message: ${message}`);
    
    if (this.smsMode === "click") {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      let smsUrl = `sms:${cleanPhone}`;
      if (isMobile) {
        const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?";
        smsUrl += `${separator}body=${encodeURIComponent(message)}`;
      } else {
        smsUrl += `?body=${encodeURIComponent(message)}`;
      }
      window.open(smsUrl, "_blank");
    } else if (this.smsMode === "auto") {
      if (!this.smsApiKey || !this.smsDeviceId) {
        alert("Textbee 자동 문자 발송 설정(API Key, Device ID)이 누락되었습니다!");
        return;
      }

      fetch(`https://api.textbee.dev/api/v1/gateway/devices/${this.smsDeviceId}/send-sms`, {
        method: "POST",
        headers: {
          "x-api-key": this.smsApiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recipients: [cleanPhone],
          message: message
        })
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        console.log("[SMS Direct Auto Sent Successfully]", data);
        alert("교재 완료 안내 문자가 자동으로 성공적으로 발송되었습니다!");
      })
      .catch(err => {
        console.error("Textbee SMS 발송 오류: ", err);
        alert("문자 자동 발송 중 오류가 발생했습니다: " + err.message);
      });
    }
  }
}
