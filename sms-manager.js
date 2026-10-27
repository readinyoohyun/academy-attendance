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
  get smsLocalIp() { return this.app.smsLocalIp; }
  set smsLocalIp(val) { this.app.smsLocalIp = val; }
  get smsTemplateIn() { return this.app.smsTemplateIn; }
  set smsTemplateIn(val) { this.app.smsTemplateIn = val; }
  get smsTemplateOut() { return this.app.smsTemplateOut; }
  set smsTemplateOut(val) { this.app.smsTemplateOut = val; }

  initSmsSettings() {
    const smsModeSelect = document.getElementById("smsModeSelect");
    const smsGatewaySettings = document.getElementById("smsGatewaySettings");
    const smsLocalSettings = document.getElementById("smsLocalSettings");
    const smsGatewayApiKey = document.getElementById("smsGatewayApiKey");
    const smsGatewayDeviceId = document.getElementById("smsGatewayDeviceId");
    const smsLocalIp = document.getElementById("smsLocalIp");
    const smsTemplateIn = document.getElementById("smsTemplateIn");
    const smsTemplateOut = document.getElementById("smsTemplateOut");
    const btnSaveSmsSettings = document.getElementById("btnSaveSmsSettings");

    if (!smsModeSelect) return;

    // Set initial values
    smsModeSelect.value = this.smsMode;
    smsGatewayApiKey.value = this.smsApiKey;
    smsGatewayDeviceId.value = this.smsDeviceId;
    if (smsLocalIp) smsLocalIp.value = this.smsLocalIp;
    smsTemplateIn.value = this.smsTemplateIn;
    smsTemplateOut.value = this.smsTemplateOut;

    // Toggle gateway/local fields based on mode
    const toggleGatewayFields = () => {
      if (smsModeSelect.value === "auto") {
        smsGatewaySettings.style.display = "block";
        if (smsLocalSettings) smsLocalSettings.style.display = "none";
      } else if (smsModeSelect.value === "local") {
        smsGatewaySettings.style.display = "none";
        if (smsLocalSettings) smsLocalSettings.style.display = "block";
      } else {
        smsGatewaySettings.style.display = "none";
        if (smsLocalSettings) smsLocalSettings.style.display = "none";
      }
    };
    toggleGatewayFields();

    smsModeSelect.addEventListener("change", toggleGatewayFields);

    btnSaveSmsSettings.onclick = (e) => {
      e.preventDefault();
      this.smsMode = smsModeSelect.value;
      this.smsApiKey = smsGatewayApiKey.value.trim();
      this.smsDeviceId = smsGatewayDeviceId.value.trim();
      if (smsLocalIp) this.smsLocalIp = smsLocalIp.value.trim();
      this.smsTemplateIn = smsTemplateIn.value.trim();
      this.smsTemplateOut = smsTemplateOut.value.trim();
      
      this.app.saveState();
      alert("문자 발송 설정이 안전하게 저장되었습니다!");
    };
  }

  sendSmsNotification(student, type, timeVal) {
    if (this.smsMode === "none") return;

    // 1. Get phone number
    const memberRec = this.app.state.memberAnalysis.find(m => m.name.replace(/\s+/g, '') === student.name.replace(/\s+/g, ''));
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
    } else if (this.smsMode === "local") {
      // Option C: Local Wi-Fi SMS Gateway (Totally Free & Direct)
      if (!this.smsLocalIp) {
        this.app.showToast("로컬 IP 주소가 입력되지 않았습니다!", true);
        return;
      }
      
      let targetUrl = this.smsLocalIp.trim();
      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = "http://" + targetUrl;
      }
      
      // If the user already typed a specific path (like /send, /send-sms, /sms, etc.), use it directly
      let sendUrl = targetUrl;
      let hasCustomPath = targetUrl.includes("/send") || targetUrl.includes("/sms") || targetUrl.includes("/message");
      if (!hasCustomPath) {
        sendUrl = targetUrl.endsWith("/") ? targetUrl + "send" : targetUrl + "/send";
      }
      
      console.log(`[SMS Local Send] Requesting local gateway: ${sendUrl}`);
      
      const payload = {
        to: cleanPhone,
        phone: cleanPhone,
        number: cleanPhone,
        recipients: [cleanPhone],
        message: message
      };
      
      fetch(sendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (!res.ok && !hasCustomPath) {
          console.log("[SMS Local Send] /send failed, trying root URL POST /...");
          return fetch(targetUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });
        }
        return res;
      })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Local SMS Gateway returned HTTP ${res.status}`);
        }
        console.log("[SMS Local Sent Successfully]");
        this.app.showToast("로컬 와이파이 문자 발송 완료!");
      })
      .catch(err => {
        console.error("Local SMS Gateway Send Error: ", err);
        this.app.showToast("로컬 문자 발송 실패 (네트워크/IP 확인 필요)", true);
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
    const selectorRow = document.getElementById("briefingSelectorRow");
    if (selectorRow) selectorRow.style.display = "none";
    const memberRec = (this.app.state.memberAnalysis || []).find(m => m.name.replace(/\s+/g, '') === studentName.replace(/\s+/g, ''));
    const phone = memberRec ? (memberRec.phone || "").trim() : "";
    
    const message = `[생각나래] ${studentName} 학생이 교재 [${completedTitle}] 학습을 잘 완료했습니다. 다음 교재인 [${nextTitle}]를 준비해서 보내주시기 바랍니다.`;
    this.openSmsModalWithContent(`📖 다음 교재 준비 안내 문자 발송 (${studentName})`, phone, message);
  }

  buildDailyBriefingMessage(studentName, preferredDate = "") {
    const cleanTarget = (studentName || "").replace(/\s+/g, "");
    const allRecs = (this.app.state.learningRecords || []).filter(
      r => (r.name || "").replace(/\s+/g, "") === cleanTarget
    );

    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayMd = `${now.getMonth() + 1}/${now.getDate()}`;

    let targetDate = preferredDate || todayIso;
    let dayRecs = allRecs.filter(r => (r.date || "").slice(0, 10) === targetDate);
    if (!preferredDate && dayRecs.length === 0 && allRecs.length > 0) {
      targetDate = allRecs.reduce((max, r) => {
        const d = (r.date || "").slice(0, 10);
        return d > max ? d : max;
      }, "") || todayIso;
      dayRecs = allRecs.filter(r => (r.date || "").slice(0, 10) === targetDate);
    }

    const mdLabel = targetDate.length >= 10
      ? `${parseInt(targetDate.slice(5, 7), 10)}/${parseInt(targetDate.slice(8, 10), 10)}`
      : todayMd;

    let hwStatus = "";
    let step1Memo = "";
    let reflection = "";
    const books = [];
    const trainings = [];
    const wrongWordsAll = [];

    dayRecs.forEach(r => {
      let normHw = String(r.hwStatus || "").trim();
      if (normHw === "완료") normHw = "숙제완료";
      else if (normHw === "미완료" || normHw === "미완") normHw = "숙제미완";
      else if (normHw === "학원에서 풀기") normHw = "학원에서풀기";
      if (normHw && !hwStatus) hwStatus = normHw;

      const cleanStep1 = (r.step1Memo && r.book && String(r.step1Memo).trim() === String(r.book).trim()) ? "" : String(r.step1Memo || "").trim();
      if (cleanStep1 && !step1Memo) step1Memo = cleanStep1;
      if (r.reflection && !reflection) reflection = r.reflection;

      if (r.book || r.vocabTotal || r.diagScore) {
        let bLine = `• 도서: ${r.book || "어휘 학습"}${r.level ? ` (${r.level})` : ""}`;
        const sub = [];
        if (r.diagScore !== "" && r.diagScore !== undefined) sub.push(`독서이해도 진단 ${r.diagScore}점`);
        if (r.vocabTotal !== "" && r.vocabTotal !== undefined) {
          sub.push(`어휘학습 ${r.vocabTotal}문항 중 ${r.vocabCorrect || 0}개 정답(${r.vocabRate || 0}%)`);
        }
        if (sub.length) bLine += ` — ${sub.join(" / ")}`;
        const cleanStep2 = (r.step2Memo && r.detail && String(r.step2Memo).trim() === String(r.detail).trim()) ? "" : String(r.step2Memo || "").trim();
        if (cleanStep2) bLine += `\n  └ 독서발자국: "${cleanStep2}"`;
        books.push(bLine);
      }
      if (r.wrongWords) {
        const cleanedWords = String(r.wrongWords)
          .split(",")
          .map(w => w.trim())
          .filter(w => w && w !== "짝짓기" && w !== "(짝짓기)");
        if (cleanedWords.length) wrongWordsAll.push(cleanedWords.join(", "));
      }

      if (r.training) {
        let tLine = `• ${r.training}${r.detail ? `: ${r.detail}` : ""}`;
        const tSub = [];
        if (r.errors !== "" && r.errors !== undefined) tSub.push(`오답 ${r.errors}개`);
        if (r.understanding) tSub.push(`이해도: ${r.understanding}`);
        if (tSub.length) tLine += ` (${tSub.join(", ")})`;
        if (r.literacyMemo) tLine += `\n  └ 문해력발자국: "${r.literacyMemo}"`;
        trainings.push(tLine);
      }
    });

    // 오늘 출석부(dailyLogs)의 실시간 수업 기록도 정밀 파싱하여 병합 (학습기록 동기화 전에도 100% 동일한 양식으로 즉시 브리핑 지원)
    const dailyLog = (this.app.state.dailyLogs || []).find(
      d => (d.name || "").replace(/\s+/g, "") === cleanTarget && (d.grammarDone || d.contents)
    );
    if (dailyLog && dayRecs.length === 0) {
      const s = String(dailyLog.contents || "").trim();
      const g = String(dailyLog.grammarDone || "").trim();

      if (s.includes("숙제완료")) hwStatus = "숙제완료";
      else if (s.includes("숙제미완")) hwStatus = "숙제미완";
      else if (s.includes("미지참")) hwStatus = "미지참";
      else if (s.includes("학원에서 풀기") || s.includes("학원에서풀기")) hwStatus = "학원에서풀기";

      const hwBookMatch = s.match(/(?:숙제완료|숙제미완|미지참|학원에서\s*풀기)\s*\(([^)]+)\)/);
      const hwBook = hwBookMatch ? hwBookMatch[1].trim() : "";
      const step1Match = s.match(/\[성실발자국:\s*([^\]]+)\]/);
      const rawStep1 = step1Match ? step1Match[1].trim() : "";
      step1Memo = hwBook ? (rawStep1 ? `[${hwBook}] ${rawStep1}` : `[${hwBook}]`) : rawStep1;

      const step2Match = s.match(/\[독서발자국:\s*([^\]]+)\]/);
      const parsedStep2 = step2Match ? step2Match[1].trim() : "";

      const litParts = [];
      const step3Match = s.match(/\[메모:\s*([^\]]+)\]/);
      if (step3Match && step3Match[1].trim()) litParts.push(step3Match[1].trim());
      const step4Match = s.match(/\[문해력발자국:\s*([^\]]+)\]/);
      if (step4Match && step4Match[1].trim()) litParts.push(step4Match[1].trim());
      const parsedLitMemo = litParts.join(" / ");

      const reflMatch = s.match(/\[소감\]\s*([^|\r\n]+)/);
      if (reflMatch && reflMatch[1].trim()) reflection = reflMatch[1].trim();

      // [어휘] 블록 파싱
      const vocabRegex = /\[어휘\]\s*([^\/|\r\n]+)\/학습(\d+)개\/오답(\d+)개(?:\/재학습\d+개)?\/\s*『([^』]+)』(?:\s*오답:([^\/|\r\n]+))?/g;
      let vMatch;
      const recordedNormBooks = [];
      const normBookFn = (t) => String(t || "").replace(/^\[[^\]]+\]\s*/, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, "").toLowerCase();

      while ((vMatch = vocabRegex.exec(s)) !== null) {
        const vLevel = (vMatch[1] || "").trim();
        const vTotal = parseInt(vMatch[2], 10) || 0;
        const vWrong = parseInt(vMatch[3], 10) || 0;
        const vFirstCor = Math.max(0, vTotal - vWrong);
        const vRate = vTotal > 0 ? Math.round((vFirstCor / vTotal) * 100) : 0;
        const vBook = (vMatch[4] || "").trim();
        const vWrongWords = String(vMatch[5] || "")
          .split(",")
          .map(w => w.trim())
          .filter(w => w && w !== "짝짓기" && w !== "(짝짓기)");
        if (vWrongWords.length) wrongWordsAll.push(vWrongWords.join(", "));
        if (vBook) recordedNormBooks.push(normBookFn(vBook));
        books.push(`• 도서: ${vBook || "어휘 학습"}${vLevel ? ` (${vLevel})` : ""} — 어휘학습 ${vTotal}문항 중 ${vFirstCor}개 정답(${vRate}%)`);
      }

      // J열 진단 도서 파싱
      if (g) {
        g.split(/\s*,\s*/).forEach((item, idx) => {
          const cleanItem = item.trim();
          if (!cleanItem || cleanItem.startsWith("글쓰기:")) return;
          const noWrite = cleanItem.replace(/\s*(글완|글쓰기완료|글쓰기완|작성완료|작성중)\s*$/g, "").trim();
          const scMatch = noWrite.match(/^(.*?)\s+(\d{2,3})\s*점?$/);
          const bTitle = scMatch ? scMatch[1].trim() : noWrite;
          const bScore = scMatch ? scMatch[2] : "";
          let bLine = `• 도서: ${bTitle}${bScore ? ` — 독서이해도 진단 ${bScore}점` : ""}`;
          if (idx === 0 && parsedStep2) bLine += `\n  └ 독서발자국: "${parsedStep2}"`;
          books.push(bLine);
          recordedNormBooks.push(normBookFn(bTitle));
        });
      }

      // K열 도서 상태 및 트레이닝 블록 파싱
      const segments = s.split(/\s*\|\s*/);
      segments.forEach(rawSeg => {
        const seg = rawSeg.trim();
        if (!seg || seg.startsWith("[어휘]") || seg.startsWith("[소감]") || seg.startsWith("다음책:")) return;
        if (/^(?:숙제완료|숙제미완|미지참|학원에서\s*풀기)/.test(seg)) return;

        const trRegex = /(읽기|독해|듣기|문해력|오답수정\+선지분석|어휘|국어)\[([^\]]+)\]/g;
        let trMatch;
        let hadTr = false;
        while ((trMatch = trRegex.exec(seg)) !== null) {
          hadTr = true;
          const trType = trMatch[1].trim();
          const trItems = trMatch[2].split(/\s*,\s*/);
          trItems.forEach((tItem, tIdx) => {
            const cleanT = tItem.trim();
            if (!cleanT) return;
            const errMatch = cleanT.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
            const tDetail = errMatch ? errMatch[1].trim() : cleanT;
            let errNum = "";
            if (errMatch) {
              const rawErr = errMatch[2].trim();
              const slashM = rawErr.match(/\/(\d+)/);
              errNum = slashM ? slashM[1] : (rawErr.match(/\d+/) ? rawErr.match(/\d+/)[0] : "");
            }
            let tLine = `• ${trType}: ${tDetail}${errNum !== "" ? ` (오답 ${errNum}개)` : ""}`;
            if (tIdx === 0 && parsedLitMemo && trainings.length === 0) {
              tLine += `\n  └ 문해력발자국: "${parsedLitMemo}"`;
            }
            trainings.push(tLine);
          });
        }
        if (hadTr) return;

        if (/(?:독서\s*대기|독서중|완독|진단\s*완료|진단완료|책\s*찜하기|예약)/.test(seg)) {
          const cleanSeg = seg.replace(/\[독서발자국:\s*[^\]]+\]/g, "").trim();
          const bookItems = cleanSeg.split(/,\s*(?=[^,:\[\]]+(?:\([^)]*\))?[^,:\[\]]*:\s*(?:독서\s*대기|독서중|완독|진단\s*완료|진단완료|책\s*찜하기|예약))/);
          bookItems.forEach(bEntry => {
            const bm = bEntry.trim().match(/^(.+?):\s*(독서\s*대기|독서중|완독|진단\s*완료|진단완료|책\s*찜하기|예약)/);
            if (bm) {
              const bTitle = bm[1].trim();
              const bStatus = bm[2].trim();
              const nb = normBookFn(bTitle);
              const dup = recordedNormBooks.some(ex => ex && nb && (ex === nb || ex.includes(nb) || nb.includes(ex)));
              if (!dup) {
                books.push(`• 도서: ${bTitle} (${bStatus})`);
                recordedNormBooks.push(nb);
              }
            }
          });
        }
      });
    }

    const lines = [];
    lines.push(`[독서와국어 오늘의 수업 브리핑 🌿]`);
    lines.push(`안녕하세요, ${studentName} 학부모님! 오늘(${mdLabel}) 학원에서 진행한 수업 활동 안내드립니다.`);
    lines.push("");
    if (hwStatus || step1Memo) {
      lines.push(`✅ 숙제 현황: ${hwStatus || "확인 완료"}${step1Memo ? ` (${step1Memo})` : ""}`);
    }
    if (books.length) {
      lines.push(`📚 독서 & 어휘 학습`);
      books.forEach(b => lines.push(b));
    }
    if (wrongWordsAll.length) {
      lines.push(`📝 오늘 복습한 어휘: ${wrongWordsAll.join(", ")}`);
    }
    if (trainings.length) {
      lines.push(`✏️ 문해력 & 국어 트레이닝`);
      trainings.forEach(t => lines.push(t));
    }
    if (reflection) {
      lines.push(`💬 ${studentName} 학생의 오늘 다짐: "${reflection}"`);
    }
    if (!hwStatus && !books.length && !trainings.length && !reflection) {
      lines.push(`• 오늘 출석 및 정규 수업 활동을 성실히 마쳤습니다.`);
    }
    lines.push("");
    lines.push(`가정에서도 따뜻한 격려와 칭찬 부탁드립니다. 감사합니다! 😊`);
    return lines.join("\n");
  }

  showDailyBriefingModal(studentName = "", preferredDate = "") {
    const allRecs = this.app.state.learningRecords || [];
    const allStudents = this.app.state.students || [];
    const nameSet = new Set();

    // 상단 2행이 최신 학습기록이므로 앞에서부터 추가 후 전체 학생 추가
    for (let i = 0; i < allRecs.length; i++) {
      const nm = (allRecs[i].name || "").trim();
      if (nm) nameSet.add(nm);
    }
    allStudents.forEach(s => {
      const nm = (s.name || "").trim();
      if (nm) nameSet.add(nm);
    });
    const studentList = Array.from(nameSet);

    let activeStudent = (studentName || "").trim();
    if (!activeStudent && this.app.crm && this.app.crm.selectedStudent) {
      activeStudent = (this.app.crm.selectedStudent.name || "").trim();
    }
    if (!activeStudent && studentList.length > 0) {
      activeStudent = studentList[0];
    }

    const selectorRow = document.getElementById("briefingSelectorRow");
    const stSelect = document.getElementById("briefingStudentSelect");
    const dtSelect = document.getElementById("briefingDateSelect");

    const populateDatesAndRender = (targetStudent, targetDatePref = "") => {
      const cleanTarget = (targetStudent || "").replace(/\s+/g, "");
      const stRecs = allRecs.filter(r => (r.name || "").replace(/\s+/g, "") === cleanTarget);
      const dateSet = new Set();
      stRecs.forEach(r => {
        const d = (r.date || "").slice(0, 10);
        if (d) dateSet.add(d);
      });
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (dateSet.size === 0) dateSet.add(todayIso);
      const dateList = Array.from(dateSet).sort().reverse();

      let chosenDate = targetDatePref;
      if (!chosenDate) {
        chosenDate = dateSet.has(todayIso) ? todayIso : dateList[0];
      }

      if (dtSelect) {
        dtSelect.innerHTML = dateList
          .map(d => `<option value="${d}" ${d === chosenDate ? "selected" : ""}>${d}${d === todayIso ? " (오늘)" : ""}</option>`)
          .join("");
      }

      const memberRec = (this.app.state.memberAnalysis || []).find(
        m => (m.name || "").replace(/\s+/g, "") === cleanTarget
      );
      const phone = memberRec ? (memberRec.phone || "").trim() : "";
      const message = this.buildDailyBriefingMessage(targetStudent, chosenDate);
      this.openSmsModalWithContent(`📨 오늘 수업 브리핑 발송 / 카톡 복사 (${targetStudent})`, phone, message);
    };

    if (selectorRow && stSelect && dtSelect) {
      selectorRow.style.display = "grid";
      stSelect.innerHTML = studentList
        .map(nm => `<option value="${nm}" ${nm === activeStudent ? "selected" : ""}>${nm}</option>`)
        .join("");

      stSelect.onchange = () => {
        populateDatesAndRender(stSelect.value, "");
      };
      dtSelect.onchange = () => {
        populateDatesAndRender(stSelect.value, dtSelect.value);
      };
    }

    populateDatesAndRender(activeStudent, preferredDate);
  }

  buildPeriodBriefingMessage(studentName, startStr, endStr, extraSummary = "") {
    const agg = this.app.crmManager
      ? this.app.crmManager.aggregateStudentPeriodData(studentName, startStr, endStr)
      : null;

    const periodLabel = `${(startStr || "").replace(/-/g, ".")} ~ ${(endStr || "").replace(/-/g, ".")}`;
    const lines = [];
    lines.push(`[${this.app.academyName || "독서와국어"} 기간별 종합 학습 브리핑 📊]`);
    lines.push(`안녕하세요, ${studentName} 학부모님! ${periodLabel} 기간 동안 학원에서 진행한 독서·어휘·문해력 종합 성취 내역을 안내드립니다.`);
    lines.push("");

    if (agg && agg.lessonDays > 0) {
      lines.push(`📌 1. 기간 핵심 성취 요약 (${agg.lessonDays}일 수업)`);
      lines.push(`• 숙제 성실도: 완료 ${agg.hwDoneCount}회${agg.hwRate > 0 ? ` (성실도 ${agg.hwRate}%)` : ""}${agg.hwOtherCount > 0 ? ` / 미완·기타 ${agg.hwOtherCount}회` : ""}`);
      if (agg.bookCount > 0 || agg.diagCount > 0) {
        lines.push(`• 독서 & 진단: 총 ${agg.bookCount}권 학습${agg.diagCount > 0 ? ` · 독서이해도 평균 ${agg.diagAvg}점 (최고 ${agg.diagMax}점)` : ""}`);
      }
      if (agg.vocabCount > 0) {
        lines.push(`• 어휘 확인 학습: ${agg.vocabCount}회 실시 · 평균 첫 정답률 ${agg.vocabAvg}% (최고 ${agg.vocabMax}%)`);
      }
      if (agg.trTotalCount > 0) {
        lines.push(`• 집중 트레이닝: 총 ${agg.trTotalCount}회 실시 (잘 이해함 ${agg.undGood}회 / 보통 ${agg.undMid}회${agg.undLow > 0 ? ` / 보충필요 ${agg.undLow}회` : ""})`);
      }

      if (agg.bookRows && agg.bookRows.length > 0) {
        lines.push("");
        lines.push(`📚 2. 기간 내 주요 학습 도서 & 진단 성취`);
        agg.bookRows.slice(0, 6).forEach(b => {
          const parts = [];
          if (b.dScore !== "" && b.dScore !== undefined) parts.push(`진단 ${b.dScore}점`);
          if (b.vRate !== "" && b.vRate !== undefined) parts.push(`어휘 ${b.vRate}%`);
          lines.push(`• [${b.date}] ${b.book || "어휘 학습"}${b.level ? `(${b.level})` : ""}${parts.length ? ` — ${parts.join(" · ")}` : ""}`);
          if (b.step2) lines.push(`  └ 독서발자국: "${b.step2}"`);
        });
      }

      if (agg.trSummary && agg.trSummary.length > 0) {
        lines.push("");
        lines.push(`✏️ 3. 영역별 집중 트레이닝 진행 현황`);
        agg.trSummary.forEach(t => {
          lines.push(`• ${t.type}: ${t.count}회 실시${t.avgErr !== "-" ? ` (평균 오답 ${t.avgErr}개)` : ""}${t.details && t.details !== "-" ? ` — ${t.details}` : ""}`);
        });
      }

      if (agg.wrongWords && agg.wrongWords.length > 0) {
        lines.push("");
        lines.push(`📝 4. 기간 내 집중 복습 어휘: ${agg.wrongWords.slice(0, 12).join(", ")}${agg.wrongWords.length > 12 ? ` 외 ${agg.wrongWords.length - 12}개` : ""}`);
      }

      if (agg.footprints && agg.footprints.length > 0) {
        lines.push("");
        lines.push(`🌱 5. 학생 자기주도 발자국 & 수업 다짐`);
        agg.footprints.slice(0, 4).forEach(fp => {
          lines.push(`• [${fp.date}] ${fp.text}`);
        });
      }
    } else {
      lines.push(`• 선택하신 기간(${periodLabel}) 동안 정규 독서 및 국어 문해력 수업을 성실히 수행하였습니다.`);
    }

    if (extraSummary && extraSummary.trim()) {
      lines.push("");
      lines.push(`🧭 원장님 종합 코칭 소견`);
      lines.push(extraSummary.trim());
    } else if (agg && agg.coachingNote) {
      lines.push("");
      lines.push(`🧭 중점 지도 방향: ${agg.coachingNote}`);
    }

    lines.push("");
    lines.push(`가정에서도 우리 ${studentName} 학생이 꾸준히 성장할 수 있도록 따뜻한 칭찬과 격려 부탁드립니다. 감사합니다! 🌿`);
    return lines.join("\n");
  }

  showPeriodBriefingModal(studentName, startStr, endStr, extraSummary = "") {
    const selectorRow = document.getElementById("briefingSelectorRow");
    if (selectorRow) selectorRow.style.display = "none";
    const cleanTarget = (studentName || "").replace(/\s+/g, "");
    const memberRec = (this.app.state.memberAnalysis || []).find(
      m => (m.name || "").replace(/\s+/g, "") === cleanTarget
    );
    const phone = memberRec ? (memberRec.phone || "").trim() : "";
    const message = this.buildPeriodBriefingMessage(studentName, startStr, endStr, extraSummary);
    this.openSmsModalWithContent(`📊 기간 종합 학습 브리핑 발송 / 카톡 복사 (${studentName})`, phone, message);
  }

  openSmsModalWithContent(titleText, phone, message) {
    const modal = document.getElementById("modalSmsPreview");
    const titleEl = modal ? modal.querySelector(".modal-title") : null;
    const phoneInput = document.getElementById("smsPreviewPhone");
    const textInput = document.getElementById("smsPreviewText");
    const copyBtn = document.getElementById("btnCopyKakaoBriefing");
    
    if (!modal || !phoneInput || !textInput) return;
    if (titleEl && titleText) titleEl.textContent = titleText;
    
    phoneInput.value = phone || "";
    textInput.value = message || "";
    textInput.rows = Math.min(14, Math.max(7, (message || "").split("\n").length + 1));
    
    modal.classList.add("active");
    
    const closeBtn = document.getElementById("btnCloseSmsPreviewModal");
    const cancelBtn = document.getElementById("btnCancelSmsPreviewModal");
    const form = document.getElementById("formSmsPreview");
    
    const closeModal = () => {
      modal.classList.remove("active");
    };
    
    closeBtn.onclick = closeModal;
    cancelBtn.onclick = closeModal;

    if (copyBtn) {
      copyBtn.onclick = () => {
        const txt = textInput.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(() => {
            this.app.showToast("📋 브리핑 문구가 복사되었습니다! 카카오톡에 붙여넣으세요.");
          });
        } else {
          textInput.select();
          document.execCommand("copy");
          this.app.showToast("📋 브리핑 문구가 복사되었습니다! 카카오톡에 붙여넣으세요.");
        }
      };
    }
    
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
      alert("문자 발송 모드가 '발송 안 함'으로 설정되어 있습니다. [📋 카톡용 복사] 버튼을 이용하시거나 설정에서 문자 발송 모드를 변경해 주세요.");
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
        this.app.showToast("📲 학부모님께 안내 문자가 성공적으로 발송되었습니다!");
      })
      .catch(err => {
        console.error("Textbee SMS 발송 오류: ", err);
        alert("문자 자동 발송 중 오류가 발생했습니다: " + err.message);
      });
    } else if (this.smsMode === "local") {
      if (!this.smsLocalIp) {
        this.app.showToast("로컬 IP 주소가 입력되지 않았습니다!", true);
        return;
      }
      let targetUrl = this.smsLocalIp.trim();
      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = "http://" + targetUrl;
      }
      let sendUrl = targetUrl;
      const hasCustomPath = targetUrl.includes("/send") || targetUrl.includes("/sms") || targetUrl.includes("/message");
      if (!hasCustomPath) {
        sendUrl = targetUrl.endsWith("/") ? targetUrl + "send" : targetUrl + "/send";
      }
      const payload = {
        to: cleanPhone,
        phone: cleanPhone,
        number: cleanPhone,
        recipients: [cleanPhone],
        message: message
      };
      fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (!res.ok && !hasCustomPath) {
          return fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        }
        return res;
      })
      .then(res => {
        if (!res.ok) throw new Error(`Local SMS Gateway HTTP ${res.status}`);
        this.app.showToast("📲 로컬 와이파이 문자 발송 완료!");
      })
      .catch(err => {
        console.error("Local SMS Gateway Send Error: ", err);
        this.app.showToast("로컬 문자 발송 실패 (네트워크/IP 확인 필요)", true);
      });
    }
  }
}
