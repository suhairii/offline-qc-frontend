const API_BASE = "https://crafty-voter-subsidize.ngrok-free.dev/api";
const DB_NAME = "QCDatabase";
const DB_VERSION = 4; // Upgraded to v4 to clear data and fix logic
let db;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const stores = ["master_data", "qc_logs", "invalid_scans", "sync_errors", "sync_history"];
            
            stores.forEach(name => {
                if (!db.objectStoreNames.contains(name)) {
                    db.createObjectStore(name, { keyPath: name === "master_data" ? "barcode" : "id", autoIncrement: name !== "master_data" });
                }
            });

            // Kosongkan data jika upgrade ke versi 4 (Permintaan User)
            if (event.oldVersion < 4) {
                stores.forEach(name => {
                    const storeRequest = event.currentTarget.transaction.objectStore(name).clear();
                    storeRequest.onsuccess = () => console.log(`Store ${name} dikosongkan`);
                });
            }
        };
        request.onsuccess = (event) => {
            db = event.target.result;
            renderAllTables();
            updateSyncCount();
            resolve(db);
        };
        request.onerror = (e) => reject(e.target.error);
    });
};

const netStatus = document.getElementById("network-status");
const syncCountEl = document.getElementById("sync-count");

const checkServerStatus = async () => {
    try {
        const res = await fetch(`${API_BASE}/dashboard-data`, {
            headers: { 'ngrok-skip-browser-warning': '69420' }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (data.SERVER_IS_DOWN) {
            netStatus.textContent = "OFFLINE (SERVER MATI)";
            netStatus.className = "status-indicator status-offline";
        } else {
            netStatus.textContent = "ONLINE";
            netStatus.className = "status-indicator status-online";
        }
    } catch (e) {
        netStatus.textContent = "OFFLINE (KONEKSI TERPUTUS)";
        netStatus.className = "status-indicator status-offline";
    }
};

// Cek status setiap 5 detik
setInterval(checkServerStatus, 5000);
checkServerStatus();

const qcForm = document.getElementById("qc-form");
const manualForm = document.getElementById("manual-form");
const toastEl = document.getElementById("toast");
const barcodeInput = document.getElementById("barcode");
const itemDetailsPanel = document.getElementById("item-details");

const showToast = (msg, type = "success") => {
    toastEl.textContent = msg;
    toastEl.className = `toast ${type}`;
    toastEl.classList.remove("hidden");
    setTimeout(() => toastEl.classList.add("hidden"), 3000);
};

const updateSyncCount = () => {
    if (!db) return;
    db.transaction("qc_logs").objectStore("qc_logs").count().onsuccess = e => syncCountEl.textContent = e.target.result;
};

const renderAllTables = () => {
    renderMasterPulled();
    renderSuccessHistory();
    renderInvalidHistory();
    renderSyncErrors();
    renderSyncHistory();
};

const renderMasterPulled = () => {
    if (!db) return;
    const tx = db.transaction("master_data", "readonly");
    const mStore = tx.objectStore("master_data");

    mStore.getAll().onsuccess = e => {
        const data = e.target.result;
        const list = document.getElementById("master-pulled-list");
        const progressEl = document.getElementById("progress-qc");
        
        const total = data.length;
        const done = data.filter(item => item.is_scanned === true).length;
        progressEl.textContent = `Progress QC: ${done} / ${total}`;

        if (data.length === 0) {
            list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 1.5rem;">Belum ada data.</td></tr>';
            return;
        }

        list.innerHTML = data.map(item => {
            const isDone = item.is_scanned === true;
            return `<tr><td><strong>${item.barcode}</strong> ${isDone ? '[Selesai]' : ''}</td><td>${item.nama_item}</td><td><span class="status-badge" style="background:${isDone ? '#16a34a' : '#64748b'}">${isDone ? '[Selesai]' : '[Pending]'}</span></td></tr>`;
        }).join('');
    };
};

const renderSuccessHistory = () => {
    db.transaction("qc_logs").objectStore("qc_logs").getAll().onsuccess = e => {
        const data = e.target.result.reverse();
        document.getElementById("success-list").innerHTML = data.map(i => `<tr><td><strong>${i.barcode}</strong></td><td><span class="status-badge" style="background:${i.status === 'Pass' ? '#16a34a' : '#eab308'}">${i.status}</span></td><td>${new Date(i.timestamp).toLocaleTimeString()}</td></tr>`).join('');
    };
};

const renderInvalidHistory = () => {
    db.transaction("invalid_scans").objectStore("invalid_scans").getAll().onsuccess = e => {
        const data = e.target.result.reverse();
        document.getElementById("invalid-list").innerHTML = data.map(i => `<tr><td><strong style="color:var(--danger)">${i.barcode}</strong></td><td>${i.reason}</td><td>${new Date(i.timestamp).toLocaleTimeString()}</td></tr>`).join('');
    };
};

const renderSyncErrors = () => {
    db.transaction("sync_errors").objectStore("sync_errors").getAll().onsuccess = e => {
        const data = e.target.result.reverse();
        document.getElementById("sync-error-list").innerHTML = data.map(i => `<tr><td style="color:var(--danger)">${i.message}</td><td>${i.category}</td><td>${new Date(i.timestamp).toLocaleString()}</td></tr>`).join('');
    };
};

const renderSyncHistory = () => {
    db.transaction("sync_history").objectStore("sync_history").getAll().onsuccess = e => {
        const data = e.target.result.reverse();
        document.getElementById("sync-history-list").innerHTML = data.map(i => `<tr><td>${i.log}</td></tr>`).join('');
    };
};

document.getElementById("btn-pull").addEventListener("click", async () => {
    try {
        const res = await fetch(`${API_BASE}/master-data`, {
            headers: { 'ngrok-skip-browser-warning': '69420' }
        });
        const data = await res.json();
        const tx = db.transaction("master_data", "readwrite");
        await tx.objectStore("master_data").clear();
        data.forEach(i => tx.objectStore("master_data").put(i));
        showToast(`[Sukses] Sinkronisasi ${data.length} item`);
        renderAllTables();
    } catch (e) { showToast("[Gagal] Tarik data", "error"); }
});

barcodeInput.addEventListener("input", e => {
    const barcode = e.target.value.trim();
    if (barcode.length < 3) return itemDetailsPanel.classList.remove("visible");
    db.transaction("master_data").objectStore("master_data").get(barcode).onsuccess = ev => {
        const res = ev.target.result;
        if (res) {
            document.getElementById("read-nama").value = res.nama_item;
            document.getElementById("read-batch").value = res.batch;
            document.getElementById("read-desc").value = res.deskripsi;
            itemDetailsPanel.classList.add("visible");
        } else itemDetailsPanel.classList.remove("visible");
    };
});

qcForm.addEventListener("submit", e => {
    e.preventDefault();
    const barcode = barcodeInput.value.trim();
    const status = document.getElementById("status").value;
    const tx = db.transaction(["master_data", "qc_logs", "invalid_scans"], "readwrite");
    const masterStore = tx.objectStore("master_data");
    
    masterStore.get(barcode).onsuccess = ev => {
        const item = ev.target.result;
        if (item) {
            item.is_scanned = true;
            masterStore.put(item);
            tx.objectStore("qc_logs").add({ barcode, status, metode: "Scan", timestamp: new Date().toISOString() });
            showToast("[Sukses] Simpan Lokal dan Update Master");
        } else {
            tx.objectStore("invalid_scans").add({ barcode, reason: "Barcode Tidak Terdaftar", timestamp: new Date().toISOString() });
            showToast("[Gagal] Barcode Invalid", "error");
        }
        qcForm.reset(); barcodeInput.focus(); itemDetailsPanel.classList.remove("visible");
        renderAllTables(); updateSyncCount();
    };
});

manualForm.addEventListener("submit", e => {
    e.preventDefault();
    const barcode = document.getElementById("m-barcode").value;
    const status = document.getElementById("m-status").value;
    const tx = db.transaction(["master_data", "qc_logs"], "readwrite");
    const masterStore = tx.objectStore("master_data");

    masterStore.get(barcode).onsuccess = ev => {
        const item = ev.target.result;
        if (item) {
            item.is_scanned = true;
            masterStore.put(item);
        }
        tx.objectStore("qc_logs").add({ barcode, status, metode: "Manual", timestamp: new Date().toISOString() });
        showToast("[Sukses] Data Manual Tersimpan");
        manualForm.reset(); renderAllTables(); updateSyncCount();
    };
});

document.getElementById("btn-auto-scan").addEventListener("click", () => simulateAuto("Pass"));
document.getElementById("btn-auto-reject").addEventListener("click", () => simulateAuto("Reject"));

const simulateAuto = (status) => {
    const tx = db.transaction("master_data", "readonly");
    tx.objectStore("master_data").getAll().onsuccess = e => {
        const master = e.target.result;
        const remaining = master.filter(m => m.is_scanned !== true);
        if (remaining.length > 0) {
            const random = remaining[0];
            barcodeInput.value = random.barcode;
            document.getElementById("status").value = status;
            barcodeInput.dispatchEvent(new Event('input'));
            setTimeout(() => qcForm.dispatchEvent(new Event('submit')), 600);
        } else showToast("[Peringatan] Semua sudah di-scan", "error");
    };
};

document.getElementById("btn-push").addEventListener("click", async () => {
    db.transaction("qc_logs").objectStore("qc_logs").getAll().onsuccess = async e => {
        const logs = e.target.result;
        if (logs.length === 0) return showToast("[Peringatan] Tidak ada data", "error");
        
        try {
            const res = await fetch(`${API_BASE}/sync-qc`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "69420"
                },
                body: JSON.stringify(logs)
            });


            if (!res.ok) {
                let msg = "";
                let detail = "";
                
                if (res.status === 503) {
                    msg = "Server pusat dalam mode pemeliharaan. Data aman di penyimpanan lokal.";
                    detail = "Kemungkinan penyebab: Admin sedang mengaktifkan mode simulasi server mati (503 Service Unavailable), atau server menolak koneksi secara sengaja.";
                } else if (res.status === 500) {
                    msg = "Terjadi kesalahan pada server pusat. Hubungi tim teknis.";
                    detail = "Kemungkinan penyebab: Terdapat malfungsi pada kode backend atau kegagalan koneksi database di sisi server (500 Internal Server Error).";
                } else {
                    msg = `Terjadi kesalahan (Status: ${res.status})`;
                    detail = `Respons server: ${res.statusText}`;
                }
                throw { message: msg, detail: detail };
            }

            const count = logs.length;
            const time = new Date().toLocaleString();
            const successMsg = `[Sukses] Berhasil mengirim ${count} data pada ${time}`;
            
            const histTx = db.transaction(["sync_history", "qc_logs"], "readwrite");
            histTx.objectStore("sync_history").add({ log: successMsg, timestamp: new Date().toISOString() });
            histTx.objectStore("qc_logs").clear();
            
            showToast("[Sukses] Sinkronisasi Berhasil");
            renderAllTables(); updateSyncCount();
            
        } catch (err) {
            let finalMsg = err.message;
            let finalDetail = err.detail;

            if (err instanceof TypeError) {
                finalMsg = "Koneksi terputus. Pastikan jaringan aktif.";
                finalDetail = "Kemungkinan penyebab: Perangkat kehilangan sinyal WiFi, kabel LAN terputus, atau server pusat mati total sehingga tidak memberikan respons sama sekali.";
            }

            const errTx = db.transaction("sync_errors", "readwrite");
            errTx.objectStore("sync_errors").add({ 
                message: finalMsg, 
                category: finalDetail, 
                timestamp: new Date().toISOString() 
            });
            
            alert(finalMsg + "\n\n" + finalDetail);
            renderAllTables();
        }
    };
});

initDB();
