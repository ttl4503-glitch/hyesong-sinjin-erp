"use client";

import { useRef, useState } from "react";
import {
  COMPANIES,
  Project,
  LaborLog,
  autoProgressEnabled,
  computeProgress,
  fmtDate,
  formatWon,
  getKnownJobTypes,
  getKnownNames,
  getWorkItemProgress,
  todayStr,
  totalInvestedCost,
} from "@/lib/erp";
import { api } from "@/lib/api";
import type { ParsedWorkItem } from "@/lib/parseWorkItems";
import { compressImage } from "@/lib/compressImage";
import { extractReceiptAmount } from "@/lib/receiptOcr";

const RECEIPT_TYPES = ["장비", "자재", "식대", "참", "운반비", "잡자재"];
const TAX_INVOICE_TYPES = ["장비", "자재", "운반비", "잡자재"];
const VENDOR_TYPES = ["자재", "식대", "운반비", "잡자재"];
// Types whose amount/unit/vendor can be auto-filled from a previously-used
// name (equipment cost is computed from 공수×단가, so it's excluded there).
const OCR_AMOUNT_TYPES = ["자재", "식대", "참", "운반비", "잡자재"];
// Types that get OCR-based auto amount recognition when a receipt photo is
// attached. 식대/참 are excluded on purpose — the amount is entered by hand
// and the photo is just kept as backup proof, not auto-read.
const RECEIPT_OCR_TYPES: string[] = [];
// 식대/참 rows only need a name and an amount — no unit/qty/vendor/공종.
const SIMPLE_AMOUNT_TYPES = ["식대", "참"];

interface DraftWorkItem extends ParsedWorkItem {
  _key: string;
}

interface DraftDailyRow {
  _key: string;
  type: string;
  jobType: string;
  name: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  workItemId: string;
  taxInvoice: boolean;
  vendor: string;
  pendingReceipt?: string;
}

function emptyDailyRow(type: string): DraftDailyRow {
  return {
    _key: nextDraftKey(),
    type,
    jobType: "",
    name: "",
    qty: type === "인력" || type === "장비" ? 1 : 0,
    unit: DEFAULT_UNIT[type] || "",
    rate: 0,
    amount: 0,
    workItemId: "",
    taxInvoice: false,
    vendor: "",
  };
}

let draftKeySeq = 0;
function nextDraftKey() {
  draftKeySeq += 1;
  return `d${draftKeySeq}`;
}

const TYPE_CLASS: Record<string, string> = {
  인력: "person",
  장비: "equip",
  자재: "material",
  식대: "meal",
  참: "snack",
  운반비: "freight",
  잡자재: "misc",
};

const TYPES_ORDER = ["인력", "장비", "자재", "식대", "참", "운반비", "잡자재"];

const DEFAULT_UNIT: Record<string, string> = {
  인력: "공수",
  장비: "공수",
  자재: "개",
  식대: "건",
  참: "건",
  운반비: "건",
  잡자재: "건",
};

const NAME_PLACEHOLDER: Record<string, string> = {
  인력: "이름 (예: 홍길동)",
  장비: "장비명 (예: 굴삭기 0.6)",
  자재: "자재명 (예: 마사토)",
  식대: "항목 (예: 점심식사)",
  참: "항목 (예: 오후참)",
  운반비: "항목 (예: 자재 운반비)",
  잡자재: "항목 (예: 소모품)",
};

interface LaborFormState {
  type: string;
  jobType: string;
  name: string;
  qty: string;
  unit: string;
  rate: string;
  amount: string;
  date: string;
  note: string;
  taxInvoice: boolean;
  vendor: string;
  workItemId: string;
}

function emptyLaborForm(): LaborFormState {
  return {
    type: "인력",
    jobType: "",
    name: "",
    qty: "1",
    unit: "공수",
    rate: "",
    amount: "",
    date: todayStr(),
    note: "",
    taxInvoice: false,
    vendor: "",
    workItemId: "",
  };
}

function logToForm(l: LaborLog): LaborFormState {
  return {
    type: l.type,
    jobType: l.jobType || "",
    name: l.name,
    qty: String(l.qty ?? ""),
    unit: l.unit || "",
    rate: String(l.rate || ""),
    amount: String(l.amount || ""),
    date: l.date || todayStr(),
    note: l.note || "",
    taxInvoice: !!l.taxInvoice,
    vendor: l.vendor || "",
    workItemId: l.workItemId || "",
  };
}

export default function ProjectSheet({
  mode,
  project,
  allProjects,
  defaultCompany,
  onClose,
  onCreated,
  onProjectUpdated,
  onDeleted,
}: {
  mode: "add" | "edit";
  project: Project | null;
  allProjects: Project[];
  defaultCompany?: string;
  onClose: () => void;
  onCreated: (p: Project) => void;
  onProjectUpdated: (p: Project) => void;
  onDeleted: (id: string) => void;
}) {
  const isEdit = mode === "edit" && !!project;

  const [form, setForm] = useState({
    company: project?.company || defaultCompany || COMPANIES[0],
    name: project?.name || "",
    location: project?.location || "",
    startDate: project?.startDate || "",
    endDate: project?.endDate || "",
    contractAmount: project?.contractAmount ? String(project.contractAmount) : "",
    progress: project?.progress || 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [logForm, setLogForm] = useState<LaborFormState>(emptyLaborForm());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState("");
  const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
  const [boqOpen, setBoqOpen] = useState(false);
  const [boqPreview, setBoqPreview] = useState<DraftWorkItem[] | null>(null);
  const [boqPreviewFileName, setBoqPreviewFileName] = useState("");
  const [boqSaving, setBoqSaving] = useState(false);

  const [dailyDate, setDailyDate] = useState(todayStr());
  const [dailyRows, setDailyRows] = useState<DraftDailyRow[]>([]);
  const [dailyNoteText, setDailyNoteText] = useState("");
  const [dailySaving, setDailySaving] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [dailyOcrBusyKey, setDailyOcrBusyKey] = useState<string | null>(null);
  const [pendingDailyRowKey, setPendingDailyRowKey] = useState<string | null>(null);
  const dailyReceiptInputRef = useRef<HTMLInputElement>(null);
  const dailyGalleryInputRef = useRef<HTMLInputElement>(null);
  const [showManualForm, setShowManualForm] = useState(false);

  function toggleGroup(type: string) {
    setOpenTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  }

  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  function toggleMonth(month: string) {
    setOpenMonths((prev) => ({ ...prev, [month]: !prev[month] }));
  }

  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  function toggleDate(date: string) {
    setOpenDates((prev) => ({ ...prev, [date]: !prev[date] }));
  }

  const [backupYear, setBackupYear] = useState(todayStr().slice(0, 4));

  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  function startEditNote(date: string, current: string) {
    setEditingNoteDate(date);
    setNoteDraft(current);
  }

  async function saveNote() {
    if (!project || editingNoteDate === null) return;
    const updated = await api.upsertDailyNote(project.id, editingNoteDate, noteDraft);
    const exists = project.dailyNotes.some((n) => n.date === editingNoteDate);
    onProjectUpdated({
      ...project,
      dailyNotes: exists
        ? project.dailyNotes.map((n) => (n.date === editingNoteDate ? updated : n))
        : [...project.dailyNotes, updated],
    });
    setEditingNoteDate(null);
  }

  const [receiptBusyId, setReceiptBusyId] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [pendingReceiptLogId, setPendingReceiptLogId] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  function triggerReceiptUpload(logId: string) {
    setPendingReceiptLogId(logId);
    receiptInputRef.current?.click();
  }

  async function handleReceiptFile(file: File) {
    if (!project || !pendingReceiptLogId) return;
    const logId = pendingReceiptLogId;
    setReceiptBusyId(logId);
    try {
      const dataUrl = await compressImage(file);
      await api.uploadReceipt(logId, dataUrl);
      onProjectUpdated({
        ...project,
        laborLogs: project.laborLogs.map((l) => (l.id === logId ? { ...l, receipt: { id: logId } } : l)),
      });
    } catch (e: any) {
      alert(e.message || "영수증 업로드에 실패했어요.");
    } finally {
      setReceiptBusyId(null);
      setPendingReceiptLogId(null);
    }
  }

  async function viewReceipt(logId: string) {
    try {
      const { imageData } = await api.getReceipt(logId);
      setPendingReceiptLogId(logId);
      setViewingReceipt(imageData);
    } catch {
      alert("영수증을 불러오지 못했어요.");
    }
  }

  async function deleteReceipt(logId: string) {
    if (!project) return;
    if (!confirm("영수증 사진을 삭제할까요?")) return;
    await api.deleteReceipt(logId);
    onProjectUpdated({
      ...project,
      laborLogs: project.laborLogs.map((l) => (l.id === logId ? { ...l, receipt: null } : l)),
    });
    setViewingReceipt(null);
  }

  const draftPseudoProject: Project | null = project
    ? { ...project, contractAmount: Number(form.contractAmount) || project.contractAmount }
    : null;

  async function handleSaveFields() {
    if (!form.name.trim()) {
      setError("공사명을 입력해주세요.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const data = {
        company: form.company,
        name: form.name.trim(),
        location: form.location.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        contractAmount: Number(form.contractAmount) || 0,
        progress: Number(form.progress) || 0,
      };
      if (isEdit && project) {
        const updated = await api.updateProject(project.id, data);
        onProjectUpdated(updated);
        // Keep the sheet open after editing an existing project so the user
        // can make several changes in a row without reopening it each time.
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
      } else {
        const created = await api.createProject(data);
        onCreated(created);
        onClose();
      }
    } catch (e: any) {
      setError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (!project) return;
    if (!confirm("이 공사를 삭제할까요? 되돌릴 수 없어요.")) return;
    try {
      await api.deleteProject(project.id);
      onDeleted(project.id);
      onClose();
    } catch (e: any) {
      setError(e.message || "삭제 중 오류가 발생했어요.");
    }
  }

  async function handleToggleCompleted(completed: boolean) {
    if (!project) return;
    if (!confirm(completed ? "이 공사를 완료 처리할까요?" : "이 공사를 진행중으로 되돌릴까요?")) return;
    try {
      const updated = await api.updateProject(project.id, { completed });
      onProjectUpdated(updated);
      onClose();
    } catch (e: any) {
      setError(e.message || "처리 중 오류가 발생했어요.");
    }
  }

  function onLgTypeChange(type: string) {
    const isLaborType = type === "인력" || type === "장비";
    setLogForm((f) => ({
      ...f,
      type,
      unit: DEFAULT_UNIT[type] || "",
      jobType: isLaborType ? f.jobType : "",
      amount: isLaborType ? f.amount : f.amount,
    }));
  }

  function onLgNameChange(name: string) {
    setLogForm((f) => {
      const next = { ...f, name };
      const known = getKnownNames(allProjects).find((k) => k.name === name && k.type === f.type);
      if (known && (f.type === "인력" || f.type === "장비") && known.rate) {
        next.rate = String(known.rate);
      }
      if (known && f.type === "인력" && known.jobType) {
        next.jobType = known.jobType;
      }
      if (known && OCR_AMOUNT_TYPES.includes(f.type)) {
        if (known.unit) next.unit = known.unit;
        if (known.vendor) next.vendor = known.vendor;
      }
      return next;
    });
  }

  async function handleSubmitLaborLog() {
    if (!project) return;
    const isLaborType = logForm.type === "인력" || logForm.type === "장비";
    const qty = Number(logForm.qty) || 0;
    const rate = Number(logForm.rate) || 0;
    const amount = isLaborType ? qty * rate : Number(logForm.amount) || 0;

    if (!logForm.name.trim()) {
      alert("이름/항목명을 입력해주세요.");
      return;
    }
    if (qty <= 0 && amount <= 0) {
      alert("공수(수량) 또는 금액 중 하나는 입력해주세요.");
      return;
    }

    const payload = {
      type: logForm.type,
      jobType: logForm.jobType,
      name: logForm.name.trim(),
      qty,
      unit: logForm.unit,
      rate,
      amount,
      date: logForm.date || todayStr(),
      note: logForm.note,
      vendor: logForm.vendor,
      taxInvoice: logForm.taxInvoice,
      workItemId: logForm.workItemId || null,
    };

    if (editingLogId) {
      const updated = await api.updateLaborLog(project.id, editingLogId, payload);
      onProjectUpdated({
        ...project,
        laborLogs: project.laborLogs.map((l) => (l.id === editingLogId ? updated : l)),
      });
    } else {
      const created = await api.addLaborLog(project.id, payload);
      onProjectUpdated({ ...project, laborLogs: [...project.laborLogs, created] });
    }
    setEditingLogId(null);
    setLogForm(emptyLaborForm());
  }

  function startEditLog(l: LaborLog) {
    setEditingLogId(l.id);
    setLogForm(logToForm(l));
    setShowManualForm(true);
  }

  function startInlineEditLog(l: LaborLog) {
    setEditingLogId(l.id);
    setLogForm(logToForm(l));
  }

  function cancelEditLog() {
    setEditingLogId(null);
    setLogForm(emptyLaborForm());
  }

  async function handleDeleteLog(logId: string) {
    if (!project) return;
    await api.deleteLaborLog(project.id, logId);
    onProjectUpdated({ ...project, laborLogs: project.laborLogs.filter((l) => l.id !== logId) });
    if (editingLogId === logId) cancelEditLog();
  }

  async function handleUploadWorkItems(file: File) {
    if (!project) return;
    setUploadError("");
    try {
      const parsed = await api.parseWorkItems(project.id, file);
      setBoqPreview(parsed.items.map((it) => ({ ...it, _key: nextDraftKey() })));
      setBoqPreviewFileName(parsed.fileName);
      setBoqOpen(true);
    } catch (e: any) {
      setUploadError(e.message || "업로드 중 오류가 발생했어요.");
    }
  }

  function updatePreviewItem(key: string, field: keyof ParsedWorkItem, value: string) {
    setBoqPreview((prev) =>
      prev
        ? prev.map((it) => {
            if (it._key !== key) return it;
            if (field === "name" || field === "spec" || field === "unit") {
              return { ...it, [field]: value };
            }
            return { ...it, [field]: Number(value) || 0 };
          })
        : prev
    );
  }

  function removePreviewItem(key: string) {
    setBoqPreview((prev) => (prev ? prev.filter((it) => it._key !== key) : prev));
  }

  function addPreviewItem() {
    setBoqPreview((prev) => [
      ...(prev || []),
      { _key: nextDraftKey(), name: "", spec: "", unit: "", qty: 0, unitPrice: 0, amount: 0 },
    ]);
  }

  function startManualBoq() {
    setBoqPreview(
      (project?.workItems || []).map((w) => ({
        _key: nextDraftKey(),
        name: w.name,
        spec: w.spec,
        unit: w.unit,
        qty: w.qty,
        unitPrice: w.unitPrice,
        amount: w.amount,
        isHeader: w.isHeader,
        level: w.level,
      }))
    );
    setBoqPreviewFileName(project?.workItemsFileName || "");
    setUploadError("");
    setBoqOpen(true);
  }

  function cancelPreview() {
    setBoqPreview(null);
    setBoqPreviewFileName("");
    setUploadError("");
  }

  async function commitPreview() {
    if (!project || !boqPreview) return;
    setUploadError("");
    setBoqSaving(true);
    try {
      const updated = await api.commitWorkItems(project.id, {
        items: boqPreview.map(({ _key, ...it }) => it),
        fileName: boqPreviewFileName,
      });
      onProjectUpdated(updated);
      setBoqPreview(null);
      setBoqPreviewFileName("");
    } catch (e: any) {
      setUploadError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setBoqSaving(false);
    }
  }

  function addDailyRow(type: string) {
    setDailyRows((prev) => [...prev, emptyDailyRow(type)]);
  }

  function updateDailyRow(key: string, field: keyof DraftDailyRow, value: string | boolean) {
    setDailyRows((prev) =>
      prev.map((r) => {
        if (r._key !== key) return r;
        if (field === "taxInvoice") return { ...r, taxInvoice: Boolean(value) };
        if (field === "qty" || field === "rate" || field === "amount") {
          const next = { ...r, [field]: Number(value) || 0 };
          const isLabor = r.type === "인력" || r.type === "장비";
          if (isLabor && (field === "qty" || field === "rate")) {
            next.amount = (Number(next.qty) || 0) * (Number(next.rate) || 0);
          }
          return next;
        }
        const next = { ...r, [field]: String(value) };
        if (field === "name") {
          const known = getKnownNames(allProjects).find(
            (k) => k.name === value && k.type === r.type
          );
          if (known && (r.type === "인력" || r.type === "장비") && known.rate) {
            next.rate = known.rate;
            next.amount = (Number(next.qty) || 0) * known.rate;
          }
          if (known && r.type === "인력" && known.jobType) {
            next.jobType = known.jobType;
          }
          if (known && OCR_AMOUNT_TYPES.includes(r.type)) {
            if (known.unit) next.unit = known.unit;
            if (known.vendor) next.vendor = known.vendor;
          }
        }
        return next;
      })
    );
  }

  function removeDailyRow(key: string) {
    setDailyRows((prev) => prev.filter((r) => r._key !== key));
  }

  function triggerDailyReceipt(key: string) {
    setPendingDailyRowKey(key);
    dailyReceiptInputRef.current?.click();
  }

  function triggerDailyGalleryUpload(key: string) {
    setPendingDailyRowKey(key);
    dailyGalleryInputRef.current?.click();
  }

  async function handleDailyReceiptFile(file: File) {
    const key = pendingDailyRowKey;
    const row = dailyRows.find((r) => r._key === key);
    if (!key || !row) return;
    setDailyOcrBusyKey(key);
    try {
      const dataUrl = await compressImage(file);
      const amount = RECEIPT_OCR_TYPES.includes(row.type)
        ? await extractReceiptAmount(file).catch(() => null)
        : null;
      setDailyRows((prev) =>
        prev.map((r) => {
          if (r._key !== key) return r;
          const next = { ...r, pendingReceipt: dataUrl };
          if (amount) next.amount = amount;
          return next;
        })
      );
    } catch (e: any) {
      alert(e.message || "영수증 처리 중 오류가 발생했어요.");
    } finally {
      setDailyOcrBusyKey(null);
      setPendingDailyRowKey(null);
    }
  }

  async function commitDaily() {
    if (!project) return;
    const valid = dailyRows.filter((r) => r.name.trim() && (r.qty > 0 || r.amount > 0));
    if (valid.length === 0 && !dailyNoteText.trim()) {
      setDailyError("이름과 공수(또는 금액)를 입력하거나, 작업내용을 적어주세요.");
      return;
    }
    setDailyError("");
    setDailySaving(true);
    try {
      let nextProject = project;
      if (valid.length > 0) {
        const created = await api.bulkAddLaborLogs(
          project.id,
          valid.map(({ _key, pendingReceipt, ...r }) => ({ ...r, date: dailyDate, note: "" }))
        );
        const withReceipts: typeof created = await Promise.all(
          created.map(async (log: LaborLog, i: number) => {
            const receiptData = valid[i]?.pendingReceipt;
            if (!receiptData) return log;
            await api.uploadReceipt(log.id, receiptData);
            return { ...log, receipt: { id: log.id } };
          })
        );
        nextProject = { ...nextProject, laborLogs: [...nextProject.laborLogs, ...withReceipts] };
      }
      if (dailyNoteText.trim()) {
        const note = await api.upsertDailyNote(project.id, dailyDate, dailyNoteText.trim());
        const exists = nextProject.dailyNotes.some((n) => n.date === dailyDate);
        nextProject = {
          ...nextProject,
          dailyNotes: exists
            ? nextProject.dailyNotes.map((n) => (n.date === dailyDate ? note : n))
            : [...nextProject.dailyNotes, note],
        };
      }
      onProjectUpdated(nextProject);
      setDailyRows([]);
      setDailyNoteText("");
    } catch (e: any) {
      setDailyError(e.message || "저장 중 오류가 발생했어요.");
    } finally {
      setDailySaving(false);
    }
  }

  const isLaborType = logForm.type === "인력" || logForm.type === "장비";
  const isPersonType = logForm.type === "인력";
  const isMaterialType = TAX_INVOICE_TYPES.includes(logForm.type);
  const lgTotal = (Number(logForm.qty) || 0) * (Number(logForm.rate) || 0);

  const knownNames = getKnownNames(allProjects);
  const knownJobTypes = getKnownJobTypes(allProjects);
  const selectableWorkItems = project ? project.workItems.filter((w) => !w.isHeader) : [];

  const totalPerson = (project?.laborLogs || [])
    .filter((l) => l.type === "인력")
    .reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const totalEquip = (project?.laborLogs || [])
    .filter((l) => l.type === "장비")
    .reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const totalCost = (project?.laborLogs || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const groupedLogs = TYPES_ORDER.map((type) => {
    const logs = (project?.laborLogs || [])
      .filter((l) => l.type === type)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const qty = logs.reduce((s, l) => s + (Number(l.qty) || 0), 0);
    const amount = logs.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    return { type, logs, qty, amount };
  }).filter((g) => g.logs.length > 0);

  const allDates = new Set<string>();
  (project?.laborLogs || []).forEach((l) => allDates.add(l.date || "날짜 미상"));
  (project?.dailyNotes || []).forEach((n) => allDates.add(n.date));

  const groupedByDate = Array.from(allDates)
    .map((date) => {
      const logs = (project?.laborLogs || []).filter((l) => (l.date || "날짜 미상") === date);
      const note = project?.dailyNotes.find((n) => n.date === date)?.content || "";
      const amount = logs.reduce((s, l) => s + (Number(l.amount) || 0), 0);
      return { date, logs, amount, note };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const backupYears = Array.from(
    new Set([
      todayStr().slice(0, 4),
      ...Array.from(allDates)
        .map((d) => d.slice(0, 4))
        .filter((y) => /^\d{4}$/.test(y)),
    ])
  ).sort((a, b) => b.localeCompare(a));

  const groupedByMonth = Object.values(
    groupedByDate.reduce<Record<string, { month: string; dates: typeof groupedByDate; amount: number }>>(
      (acc, d) => {
        const m = d.date.slice(0, 7) || "날짜 미상";
        if (!acc[m]) acc[m] = { month: m, dates: [], amount: 0 };
        acc[m].dates.push(d);
        acc[m].amount += d.amount;
        return acc;
      },
      {}
    )
  ).sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="overlay open">
      <div className="sheet">
        <div className="sheet-handle" />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: -20,
            zIndex: 5,
            background: "var(--paper)",
            margin: "-20px -18px 14px -18px",
            padding: "12px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <h2 style={{ margin: 0 }}>{isEdit ? "공사 상세" : "새 공사 등록"}</h2>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: "6px 14px", fontSize: 13 }}
            onClick={onClose}
          >
            ← 뒤로가기
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="field">
          <label>공사명</label>
          <input
            type="text"
            placeholder="예: OO공원 조경식재공사"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label>현장 위치</label>
          <input
            type="text"
            placeholder="예: 경남 김해시 OO동"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <div className="row2">
          <div className="field">
            <label>착공일</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div className="field">
            <label>준공(예정)일</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <label>계약금액 (원)</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="예: 150,000,000"
            value={form.contractAmount ? Number(form.contractAmount).toLocaleString("ko-KR") : ""}
            onChange={(e) =>
              setForm({ ...form, contractAmount: e.target.value.replace(/[^0-9]/g, "") })
            }
          />
        </div>
        <div className="field">
          <label>
            공정률{draftPseudoProject && autoProgressEnabled(draftPseudoProject) ? " (투입비용 기준 자동계산)" : ""}
          </label>
          {draftPseudoProject && autoProgressEnabled(draftPseudoProject) ? (
            <>
              <div
                className="progress-auto-display"
                style={computeProgress(draftPseudoProject) > 100 ? { color: "var(--danger)" } : undefined}
              >
                {computeProgress(draftPseudoProject)}%
              </div>
              <div className="progress-auto-sub">
                누적 투입비용 {formatWon(totalInvestedCost(draftPseudoProject))}원 / 계약금액{" "}
                {formatWon(Number(form.contractAmount) || 0)}원
              </div>
            </>
          ) : (
            <>
              <div className="slider-row">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
                />
                <div className="slider-val">{form.progress}%</div>
              </div>
              <div className="progress-auto-sub" style={{ textAlign: "left" }}>
                계약금액을 입력하면 투입비용 기준으로 자동계산돼요.
              </div>
            </>
          )}
        </div>
        {isEdit && project && (
          <>
            <div className="ms-title">착공내역서 · 공종별 진행률</div>
            <div className="wi-box">
              {boqPreview ? (
                <>
                  <div className="wi-summary">
                    업로드 미리보기 — 내용을 확인·수정한 뒤 저장하세요. 품목{" "}
                    <b>{boqPreview.filter((it) => !it.isHeader).length}개</b> · 합계{" "}
                    <b>{formatWon(boqPreview.reduce((s, it) => s + (Number(it.amount) || 0), 0))}원</b>
                  </div>
                  {uploadError && <div className="login-error" style={{ marginTop: 8 }}>{uploadError}</div>}
                  <div style={{ marginTop: 10 }}>
                    {boqPreview.map((it) =>
                      it.isHeader ? (
                        <div
                          className="wi-edit-row"
                          key={it._key}
                          style={it.level === 2 ? { marginLeft: 16 } : undefined}
                        >
                          <div className="wi-edit-row-top">
                            <input
                              className="wi-edit-name"
                              type="text"
                              style={{ fontWeight: 700, fontSize: it.level === 2 ? 13 : 14 }}
                              placeholder="구분 제목 (예: 1. 토공)"
                              value={it.name}
                              onChange={(e) => updatePreviewItem(it._key, "name", e.target.value)}
                            />
                            <div className="lg-del" onClick={() => removePreviewItem(it._key)}>
                              ✕
                            </div>
                          </div>
                        </div>
                      ) : (
                      <div className="wi-edit-row" key={it._key}>
                        <div className="wi-edit-row-top">
                          <input
                            className="wi-edit-name"
                            type="text"
                            placeholder="공종명"
                            value={it.name}
                            onChange={(e) => updatePreviewItem(it._key, "name", e.target.value)}
                          />
                          <div className="lg-del" onClick={() => removePreviewItem(it._key)}>
                            ✕
                          </div>
                        </div>
                        <div className="wi-edit-row-fields">
                          <input
                            type="text"
                            placeholder="규격"
                            value={it.spec}
                            onChange={(e) => updatePreviewItem(it._key, "spec", e.target.value)}
                          />
                          <input
                            type="text"
                            placeholder="단위"
                            value={it.unit}
                            onChange={(e) => updatePreviewItem(it._key, "unit", e.target.value)}
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="수량"
                            value={it.qty ? Number(it.qty).toLocaleString("ko-KR", { maximumFractionDigits: 3 }) : ""}
                            onChange={(e) =>
                              updatePreviewItem(it._key, "qty", e.target.value.replace(/[^0-9.]/g, ""))
                            }
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="단가"
                            value={
                              it.unitPrice
                                ? Number(it.unitPrice).toLocaleString("ko-KR", { maximumFractionDigits: 3 })
                                : ""
                            }
                            onChange={(e) =>
                              updatePreviewItem(it._key, "unitPrice", e.target.value.replace(/[^0-9.]/g, ""))
                            }
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="금액"
                            value={
                              it.amount
                                ? Number(it.amount).toLocaleString("ko-KR", { maximumFractionDigits: 3 })
                                : ""
                            }
                            onChange={(e) =>
                              updatePreviewItem(it._key, "amount", e.target.value.replace(/[^0-9.]/g, ""))
                            }
                          />
                        </div>
                      </div>
                      )
                    )}
                  </div>
                  <button className="wi-upload-btn" onClick={addPreviewItem} style={{ marginTop: 8 }}>
                    + 항목 추가
                  </button>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      className="btn-primary"
                      style={{ marginTop: 0 }}
                      onClick={commitPreview}
                      disabled={boqSaving}
                    >
                      {boqSaving ? "저장 중..." : "이 내용으로 저장"}
                    </button>
                    <button className="btn-ghost" style={{ marginTop: 0 }} onClick={cancelPreview}>
                      취소
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {project.workItems.length === 0 ? (
                    <div className="wi-empty">
                      아직 착공내역서가 등록되지 않았어요. 엑셀 파일(공종·수량·단가·금액 포함)을 업로드하거나, 아래
                      "수작업으로 입력" 버튼으로 직접 입력하면, 아래 인력·장비·자재 투입 시 공종을 선택할 수 있고
                      공종별 진행률이 자동으로 계산돼요.
                    </div>
                  ) : (
                    <div
                      className="wi-summary"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        background: "var(--paper-dark)",
                        margin: "-12px -12px 8px -12px",
                        padding: "10px 12px",
                        borderRadius: "8px 8px 0 0",
                      }}
                      onClick={() => setBoqOpen((v) => !v)}
                    >
                      <span style={{ fontSize: 15 }}>{boqOpen ? "📂" : "📁"}</span>
                      <span style={{ flex: 1 }}>
                        착공내역서 합계: <b>{formatWon(project.workItemsTotal)}원</b> · 공종{" "}
                        <b>{selectableWorkItems.length}개</b>
                        {project.workItemsFileName ? " · " + project.workItemsFileName : ""}
                        <br />
                        <span style={{ fontSize: 11, color: "#8a8371" }}>
                          {boqOpen ? "탭하면 접어요" : "탭하면 공종별 내역이 펼쳐져요"}
                        </span>
                      </span>
                      <span className={`chevron ${boqOpen ? "open" : ""}`} style={{ fontSize: 16 }}>
                        ▸
                      </span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="wi-upload-btn" onClick={() => fileInputRef.current?.click()}>
                      📁 {project.workItems.length === 0 ? "착공내역서 엑셀 업로드" : "다시 업로드"}
                    </button>
                    <button className="wi-upload-btn" onClick={startManualBoq}>
                      ✏️ {project.workItems.length === 0 ? "수작업으로 입력" : "수작업으로 추가/수정"}
                    </button>
                  </div>
                  {uploadError && <div className="login-error" style={{ marginTop: 8 }}>{uploadError}</div>}
                  {project.workItems.length > 0 && boqOpen && (
                    <div style={{ marginTop: 10 }}>
                      {project.workItems.map((w) => {
                        if (w.isHeader) {
                          const isSub = w.level === 2;
                          return (
                            <div
                              key={w.id}
                              style={{
                                fontWeight: 700,
                                fontSize: isSub ? 12 : 13,
                                marginTop: isSub ? 4 : 10,
                                marginLeft: isSub ? 16 : 0,
                                paddingBottom: 4,
                                color: isSub ? "var(--ink)" : "var(--blueprint)",
                                borderBottom: isSub ? "none" : "1px solid var(--line)",
                              }}
                            >
                              {w.name}
                            </div>
                          );
                        }
                        const prog = getWorkItemProgress(project, w.id);
                        return (
                          <div className="wi-item" key={w.id}>
                            <div className="wi-item-top">
                              <div className="wi-item-name">
                                {w.name}
                                {w.spec ? ` (${w.spec})` : ""}
                              </div>
                              <div className="wi-item-pct">{prog.pct}%</div>
                            </div>
                            <div className="wi-bar">
                              <div
                                className={`wi-bar-fill ${prog.pct > 100 ? "over" : ""}`}
                                style={{ width: `${Math.min(100, prog.pct)}%` }}
                              />
                            </div>
                            <div className="wi-item-sub">
                              투입 {formatWon(prog.invested)}원 / 예산 {formatWon(prog.budget)}원
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadWorkItems(f);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="ms-title">인력·장비·자재 투입 관리</div>
            <div className="lg-stats">
              <div className="lg-stat">
                <div className="n">{totalPerson}</div>
                <div className="l">누적 인력(공수)</div>
              </div>
              <div className="lg-stat">
                <div className="n">{totalEquip}</div>
                <div className="l">누적 장비(공수)</div>
              </div>
              <div className="lg-stat">
                <div className="n">{formatWon(totalCost)}</div>
                <div className="l">누적 투입비용(원)</div>
              </div>
            </div>

            <div className="wi-box" style={{ marginBottom: 12 }}>
              <div className="wi-summary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>일일 투입 입력 —</span>
                <input
                  type="date"
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  style={{ maxWidth: 150, fontWeight: 700 }}
                />
              </div>

              <textarea
                placeholder="오늘 작업내용 (예: 진남초 뿌리정리 엣지 재설치)"
                value={dailyNoteText}
                onChange={(e) => setDailyNoteText(e.target.value)}
                style={{ minHeight: 50, marginTop: 8, fontSize: 12 }}
              />

              {["인력", "장비"].map((type) => {
                const rows = dailyRows.filter((r) => r.type === type);
                const color = type === "인력" ? "var(--blueprint-light)" : "var(--hyesong)";
                return (
                  <div key={type} style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 6 }}>{type}투입</div>
                    {rows.map((r) => (
                      <div className="wi-edit-row" key={r._key}>
                        <div className="wi-edit-row-top">
                          <input
                            className="wi-edit-name"
                            type="text"
                            list={`lg_name_options_${type}`}
                            placeholder={type === "인력" ? "이름" : "장비명"}
                            value={r.name}
                            onChange={(e) => updateDailyRow(r._key, "name", e.target.value)}
                          />
                          <div className="lg-del" onClick={() => removeDailyRow(r._key)}>
                            ✕
                          </div>
                        </div>
                        <div className="wi-edit-row-fields">
                          {type === "인력" && (
                            <input
                              type="text"
                              list="lg_jobtype_options"
                              placeholder="직종"
                              value={r.jobType}
                              onChange={(e) => updateDailyRow(r._key, "jobType", e.target.value)}
                            />
                          )}
                          {type === "장비" && (
                            <input
                              type="text"
                              placeholder="이름 (운전자, 선택)"
                              value={r.jobType}
                              onChange={(e) => updateDailyRow(r._key, "jobType", e.target.value)}
                            />
                          )}
                          <input
                            type="number"
                            step={0.5}
                            placeholder="공수"
                            value={r.qty || ""}
                            onChange={(e) => updateDailyRow(r._key, "qty", e.target.value)}
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="단가"
                            value={r.rate ? Number(r.rate).toLocaleString("ko-KR") : ""}
                            onChange={(e) =>
                              updateDailyRow(r._key, "rate", e.target.value.replace(/[^0-9]/g, ""))
                            }
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="금액"
                            value={r.amount ? Number(r.amount).toLocaleString("ko-KR") : ""}
                            onChange={(e) =>
                              updateDailyRow(r._key, "amount", e.target.value.replace(/[^0-9]/g, ""))
                            }
                          />
                          {selectableWorkItems.length > 0 && (
                            <select
                              value={r.workItemId}
                              onChange={(e) => updateDailyRow(r._key, "workItemId", e.target.value)}
                            >
                              <option value="">공종 선택안함</option>
                              {selectableWorkItems.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name}
                                  {w.spec ? ` (${w.spec})` : ""} · 예산 {formatWon(w.amount)}원
                                </option>
                              ))}
                            </select>
                          )}
                          {type === "장비" && (
                            <>
                              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                                <input
                                  type="checkbox"
                                  checked={r.taxInvoice}
                                  onChange={(e) => updateDailyRow(r._key, "taxInvoice", e.target.checked)}
                                />
                                계산서
                              </label>
                              <span
                                className="wi-upload-btn"
                                style={{ fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
                                onClick={() => triggerDailyReceipt(r._key)}
                              >
                                {dailyOcrBusyKey === r._key
                                  ? "처리 중..."
                                  : r.pendingReceipt
                                  ? "🧾 사진 첨부됨"
                                  : "📷 촬영"}
                              </span>
                              <span
                                className="wi-upload-btn"
                                style={{ fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
                                onClick={() => triggerDailyGalleryUpload(r._key)}
                              >
                                {dailyOcrBusyKey === r._key
                                  ? "처리 중..."
                                  : r.pendingReceipt
                                  ? "🖼 첨부됨"
                                  : "🖼 사진 올리기"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <button className="wi-upload-btn" onClick={() => addDailyRow(type)}>
                      + {type} 추가
                    </button>
                  </div>
                );
              })}

              {[
                { title: "자재", types: ["자재"], addLabel: "+ 자재 추가", addType: "자재", showTypeSelect: false },
                { title: "운반비", types: ["운반비"], addLabel: "+ 운반비 추가", addType: "운반비", showTypeSelect: false },
                {
                  title: "식대·참·잡자재",
                  types: ["식대", "참", "잡자재"],
                  addLabel: "+ 식대/참/잡자재 추가",
                  addType: "식대",
                  showTypeSelect: true,
                },
              ].map((section) => (
                <div style={{ marginTop: 10 }} key={section.title}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--sinjin)", marginBottom: 6 }}>
                    {section.title}
                  </div>
                  {dailyRows
                    .filter((r) => section.types.includes(r.type))
                    .map((r) => (
                      <div className="wi-edit-row" key={r._key}>
                        <div className="wi-edit-row-top">
                          {section.showTypeSelect && (
                            <select
                              style={{ maxWidth: 80 }}
                              value={r.type}
                              onChange={(e) => updateDailyRow(r._key, "type", e.target.value)}
                            >
                              <option value="식대">식대</option>
                              <option value="참">참</option>
                              <option value="잡자재">잡자재비</option>
                            </select>
                          )}
                          <input
                            className="wi-edit-name"
                            type="text"
                            list={`lg_name_options_${r.type}`}
                            placeholder="품목"
                            value={r.name}
                            onChange={(e) => updateDailyRow(r._key, "name", e.target.value)}
                          />
                          <div className="lg-del" onClick={() => removeDailyRow(r._key)}>
                            ✕
                          </div>
                        </div>
                        <div className="wi-edit-row-fields">
                          {SIMPLE_AMOUNT_TYPES.includes(r.type) ? (
                            <>
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="금액"
                                value={r.amount ? Number(r.amount).toLocaleString("ko-KR") : ""}
                                onChange={(e) =>
                                  updateDailyRow(r._key, "amount", e.target.value.replace(/[^0-9]/g, ""))
                                }
                              />
                              <span
                                className="wi-upload-btn"
                                style={{ fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
                                onClick={() => triggerDailyReceipt(r._key)}
                              >
                                {dailyOcrBusyKey === r._key
                                  ? "인식 중..."
                                  : r.pendingReceipt
                                  ? "📷 촬영됨"
                                  : "📷 촬영"}
                              </span>
                              <span
                                className="wi-upload-btn"
                                style={{ fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
                                onClick={() => triggerDailyGalleryUpload(r._key)}
                              >
                                {dailyOcrBusyKey === r._key
                                  ? "인식 중..."
                                  : r.pendingReceipt
                                  ? "🖼 첨부됨"
                                  : "🖼 사진 올리기"}
                              </span>
                            </>
                          ) : (
                            <>
                              <input
                                type="text"
                                placeholder="규격/단위"
                                value={r.unit}
                                onChange={(e) => updateDailyRow(r._key, "unit", e.target.value)}
                              />
                              <input
                                type="number"
                                placeholder="수량"
                                value={r.qty || ""}
                                onChange={(e) => updateDailyRow(r._key, "qty", e.target.value)}
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="금액"
                                value={r.amount ? Number(r.amount).toLocaleString("ko-KR") : ""}
                                onChange={(e) =>
                                  updateDailyRow(r._key, "amount", e.target.value.replace(/[^0-9]/g, ""))
                                }
                              />
                              {VENDOR_TYPES.includes(r.type) && (
                                <input
                                  type="text"
                                  placeholder="업체명"
                                  value={r.vendor}
                                  onChange={(e) => updateDailyRow(r._key, "vendor", e.target.value)}
                                />
                              )}
                              {selectableWorkItems.length > 0 && (
                                <select
                                  value={r.workItemId}
                                  onChange={(e) => updateDailyRow(r._key, "workItemId", e.target.value)}
                                >
                                  <option value="">공종 선택안함</option>
                                  {selectableWorkItems.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name}
                                      {w.spec ? ` (${w.spec})` : ""} · 예산 {formatWon(w.amount)}원
                                    </option>
                                  ))}
                                </select>
                              )}
                              {TAX_INVOICE_TYPES.includes(r.type) && (
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                                  <input
                                    type="checkbox"
                                    checked={r.taxInvoice}
                                    onChange={(e) => updateDailyRow(r._key, "taxInvoice", e.target.checked)}
                                  />
                                  계산서
                                </label>
                              )}
                              <span
                                className="wi-upload-btn"
                                style={{ fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
                                onClick={() => triggerDailyReceipt(r._key)}
                              >
                                {dailyOcrBusyKey === r._key
                                  ? "인식 중..."
                                  : r.pendingReceipt
                                  ? "📷 촬영됨"
                                  : "📷 촬영"}
                              </span>
                              <span
                                className="wi-upload-btn"
                                style={{ fontSize: 11, padding: "4px 8px", cursor: "pointer" }}
                                onClick={() => triggerDailyGalleryUpload(r._key)}
                              >
                                {dailyOcrBusyKey === r._key
                                  ? "인식 중..."
                                  : r.pendingReceipt
                                  ? "🖼 첨부됨"
                                  : "🖼 사진 올리기"}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  <button className="wi-upload-btn" onClick={() => addDailyRow(section.addType)}>
                    {section.addLabel}
                  </button>
                </div>
              ))}

              {dailyError && <div className="login-error" style={{ marginTop: 10 }}>{dailyError}</div>}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  background: "var(--blueprint)",
                  color: "#eef3f4",
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                <span>{dailyDate} 합계</span>
                <b style={{ fontFamily: "var(--mono)" }}>
                  {formatWon(dailyRows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}원
                </b>
              </div>

              <button
                className="btn-primary"
                onClick={commitDaily}
                disabled={dailySaving || dailyRows.length === 0}
              >
                {dailySaving ? "저장 중..." : `이 날짜 저장 (${dailyRows.length}건)`}
              </button>
            </div>

            <div
              className="ms-title"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
            >
              작업일보 (월별 폴더)
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select
                  value={backupYear}
                  onChange={(e) => setBackupYear(e.target.value)}
                  style={{ fontSize: 11, padding: "2px 4px" }}
                >
                  {backupYears.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <a
                  href={`/print/${project.id}/yearly/${backupYear}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wi-upload-btn"
                  style={{ fontSize: 11, textDecoration: "none", fontWeight: 400 }}
                >
                  📎 증빙 백데이터 인쇄
                </a>
              </span>
            </div>
            <div style={{ marginBottom: 14 }}>
              {groupedByMonth.length === 0 && (
                <div style={{ fontSize: 12, color: "#a09a89", padding: "6px 0" }}>
                  등록된 일보가 없어요.
                </div>
              )}
              {groupedByMonth.map((mo) => {
                const monthOpen = !!openMonths[mo.month];
                return (
                  <div className="lg-group" key={mo.month}>
                    <div className="lg-group-header" onClick={() => toggleMonth(mo.month)}>
                      <span style={{ fontSize: 15 }}>{monthOpen ? "📂" : "📁"}</span>
                      <div className="lg-group-meta" style={{ flex: "none", fontWeight: 700, color: "var(--ink)" }}>
                        {mo.month}
                      </div>
                      <div className="lg-group-meta">
                        {mo.dates.length}일 · {formatWon(mo.amount)}원
                      </div>
                      <div className={`chevron ${monthOpen ? "open" : ""}`}>▸</div>
                    </div>
                    {monthOpen && (
                      <div className="lg-group-body">
                        {mo.dates.map((d) => {
                          const isOpen = !!openDates[d.date];
                          const byType = TYPES_ORDER.map((type) => ({
                            type,
                            logs: d.logs.filter((l) => l.type === type),
                          })).filter((g) => g.logs.length > 0);
                          return (
                            <div className="lg-group" key={d.date}>
                              <div className="lg-group-header" onClick={() => toggleDate(d.date)}>
                                <div
                                  className="lg-group-meta"
                                  style={{ flex: "none", fontWeight: 700, color: "var(--ink)" }}
                                >
                                  {fmtDate(d.date)}
                                </div>
                                <div className="lg-group-meta">
                                  {d.logs.length}건 · {formatWon(d.amount)}원
                                </div>
                                <div className={`chevron ${isOpen ? "open" : ""}`}>▸</div>
                              </div>
                              {isOpen && (
                                <div className="lg-group-body">
                                  <a
                                    href={`/print/${project.id}/${encodeURIComponent(d.date)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="wi-upload-btn"
                                    style={{
                                      display: "inline-block",
                                      marginTop: 8,
                                      textDecoration: "none",
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    🖨 이 날짜 일보 인쇄/저장
                                  </a>
                                  <div style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                                    {editingNoteDate === d.date ? (
                                      <>
                                        <textarea
                                          value={noteDraft}
                                          onChange={(e) => setNoteDraft(e.target.value)}
                                          style={{ minHeight: 44, fontSize: 12 }}
                                        />
                                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                          <button
                                            className="wi-upload-btn"
                                            style={{ fontSize: 11, padding: "4px 8px" }}
                                            onClick={saveNote}
                                          >
                                            저장
                                          </button>
                                          <span
                                            className="lg-cancel"
                                            onClick={() => setEditingNoteDate(null)}
                                          >
                                            취소
                                          </span>
                                        </div>
                                      </>
                                    ) : (
                                      <div
                                        style={{ fontSize: 12, cursor: "pointer", whiteSpace: "pre-wrap" }}
                                        onClick={() => startEditNote(d.date, d.note)}
                                      >
                                        {d.note ? (
                                          d.note
                                        ) : (
                                          <span style={{ color: "#a09a89" }}>작업내용 없음 (탭해서 입력)</span>
                                        )}{" "}
                                        <span style={{ color: "var(--blueprint-light)" }}>✎</span>
                                      </div>
                                    )}
                                  </div>
                                  {byType.map((g) => (
                                    <div
                                      key={g.type}
                                      style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}
                                    >
                                      <div
                                        className={`lg-type ${TYPE_CLASS[g.type] || "misc"}`}
                                        style={{ display: "inline-block", marginBottom: 6 }}
                                      >
                                        {g.type}
                                      </div>
                                      {g.logs.map((l) => {
                                        const qtyPart = l.qty ? `${l.qty}${l.unit || ""}` : "";
                                        const ratePart =
                                          l.rate && (l.type === "인력" || l.type === "장비")
                                            ? `단가 ${formatWon(l.rate)}원`
                                            : "";
                                        const amountPart = l.amount ? formatWon(l.amount) + "원" : "";
                                        const mid = [qtyPart, ratePart, amountPart].filter(Boolean).join(" · ");
                                        if (editingLogId === l.id) {
                                          return (
                                            <div className="lg-add" key={l.id} style={{ margin: "4px 0" }}>
                                              {selectableWorkItems.length > 0 ? (
                                                <select
                                                  className="lg-workitem-select"
                                                  value={logForm.workItemId}
                                                  onChange={(e) => setLogForm({ ...logForm, workItemId: e.target.value })}
                                                >
                                                  <option value="">공종 선택안함</option>
                                                  {selectableWorkItems.map((w) => (
                                                    <option key={w.id} value={w.id}>
                                                      {w.name}
                                                      {w.spec ? ` (${w.spec})` : ""} · 예산 {formatWon(w.amount)}원
                                                    </option>
                                                  ))}
                                                </select>
                                              ) : null}
                                              {isPersonType && (
                                                <input
                                                  className="lg-jobtype-input"
                                                  type="text"
                                                  list="lg_jobtype_options"
                                                  placeholder="직종 (예: 조경공)"
                                                  value={logForm.jobType}
                                                  onChange={(e) => setLogForm({ ...logForm, jobType: e.target.value })}
                                                />
                                              )}
                                              {logForm.type === "장비" && (
                                                <input
                                                  className="lg-jobtype-input"
                                                  type="text"
                                                  placeholder="이름 (운전자, 선택)"
                                                  value={logForm.jobType}
                                                  onChange={(e) => setLogForm({ ...logForm, jobType: e.target.value })}
                                                />
                                              )}
                                              <input
                                                className="lg-name-input"
                                                type="text"
                                                list={`lg_name_options_${logForm.type}`}
                                                placeholder={NAME_PLACEHOLDER[logForm.type] || "항목명"}
                                                value={logForm.name}
                                                onChange={(e) => onLgNameChange(e.target.value)}
                                              />
                                              <input
                                                type="number"
                                                step={0.5}
                                                min={0}
                                                placeholder={isLaborType ? "공수" : "수량"}
                                                value={logForm.qty}
                                                onChange={(e) => setLogForm({ ...logForm, qty: e.target.value })}
                                              />
                                              <input
                                                className="lg-unit-input"
                                                type="text"
                                                placeholder="단위"
                                                value={logForm.unit}
                                                onChange={(e) => setLogForm({ ...logForm, unit: e.target.value })}
                                              />
                                              {isLaborType && (
                                                <input
                                                  className="lg-rate-input"
                                                  type="number"
                                                  placeholder="단가(원)"
                                                  value={logForm.rate}
                                                  onChange={(e) => setLogForm({ ...logForm, rate: e.target.value })}
                                                />
                                              )}
                                              {!isLaborType && (
                                                <input
                                                  className="lg-amount-input"
                                                  type="number"
                                                  placeholder="금액(원)"
                                                  value={logForm.amount}
                                                  onChange={(e) => setLogForm({ ...logForm, amount: e.target.value })}
                                                />
                                              )}
                                              <input
                                                type="date"
                                                value={logForm.date}
                                                onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
                                              />
                                              <input
                                                className="lg-note-input"
                                                type="text"
                                                placeholder="비고 (선택)"
                                                value={logForm.note}
                                                onChange={(e) => setLogForm({ ...logForm, note: e.target.value })}
                                              />
                                              {VENDOR_TYPES.includes(logForm.type) && (
                                                <input
                                                  type="text"
                                                  placeholder="업체명"
                                                  value={logForm.vendor}
                                                  onChange={(e) => setLogForm({ ...logForm, vendor: e.target.value })}
                                                />
                                              )}
                                              {isMaterialType && (
                                                <div className="lg-tax-row">
                                                  <input
                                                    type="checkbox"
                                                    id={`lg_inline_tax_${l.id}`}
                                                    checked={logForm.taxInvoice}
                                                    onChange={(e) => setLogForm({ ...logForm, taxInvoice: e.target.checked })}
                                                  />
                                                  <label htmlFor={`lg_inline_tax_${l.id}`}>세금계산서 발행됨</label>
                                                </div>
                                              )}
                                              <button onClick={handleSubmitLaborLog}>수정 저장</button>
                                              <span className="lg-cancel" onClick={cancelEditLog}>
                                                취소
                                              </span>
                                            </div>
                                          );
                                        }
                                        return (
                                          <div className="lg-item" key={l.id} style={{ padding: "3px 0" }}>
                                            <div className="lg-body">
                                              <div className="lg-name" style={{ fontSize: 12 }}>
                                                {l.jobType ? l.jobType + " · " : ""}
                                                {l.name}
                                                {mid ? " · " + mid : ""}
                                                {l.vendor ? " · " + l.vendor : ""}
                                              </div>
                                            </div>
                                            {RECEIPT_TYPES.includes(l.type) && (
                                              <div
                                                className="lg-edit"
                                                style={l.receipt ? { color: "var(--blueprint-light)" } : undefined}
                                                onClick={() =>
                                                  receiptBusyId === l.id
                                                    ? undefined
                                                    : l.receipt
                                                    ? viewReceipt(l.id)
                                                    : triggerReceiptUpload(l.id)
                                                }
                                              >
                                                {receiptBusyId === l.id ? "…" : "🧾"}
                                              </div>
                                            )}
                                            <div className="lg-edit" onClick={() => startInlineEditLog(l)}>
                                              ✎
                                            </div>
                                            <div className="lg-del" onClick={() => handleDeleteLog(l.id)}>
                                              ✕
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="ms-title">유형별 누적 (인력·장비·자재·식대·잡자재)</div>
            <div>
              {groupedLogs.length === 0 && (
                <div style={{ fontSize: 12, color: "#a09a89", padding: "6px 0" }}>
                  투입 기록이 없어요.
                </div>
              )}
              {groupedLogs.map((g) => {
                const isOpen = !!openTypes[g.type];
                const isLabor = g.type === "인력" || g.type === "장비";
                const metaParts = [
                  `${g.logs.length}건`,
                  isLabor ? `${g.qty}공수` : "",
                  `${formatWon(g.amount)}원`,
                ].filter(Boolean);
                return (
                  <div className="lg-group" key={g.type}>
                    <div className="lg-group-header" onClick={() => toggleGroup(g.type)}>
                      <div className={`lg-type ${TYPE_CLASS[g.type] || "misc"}`}>{g.type}</div>
                      <div className="lg-group-meta">{metaParts.join(" · ")}</div>
                      <div className={`chevron ${isOpen ? "open" : ""}`}>▸</div>
                    </div>
                    {isOpen && (
                      <div className="lg-group-body">
                        {g.logs.map((l) => {
                          const qtyPart = l.qty ? `${l.qty}${l.unit || ""}` : "";
                          const ratePart =
                            l.rate && (l.type === "인력" || l.type === "장비")
                              ? `단가 ${formatWon(l.rate)}원`
                              : "";
                          const amountPart = l.amount ? formatWon(l.amount) + "원" : "";
                          const mid = [qtyPart, ratePart, amountPart].filter(Boolean).join(" · ");
                          const showTax = TAX_INVOICE_TYPES.includes(l.type) && l.amount;
                          const workItem = l.workItemId
                            ? project.workItems.find((w) => w.id === l.workItemId)
                            : null;
                          return (
                            <div className="lg-item" key={l.id}>
                              <div className="lg-body">
                                <div className="lg-name">
                                  {workItem && (
                                    <span style={{ color: "var(--blueprint-light)" }}>
                                      [{workItem.name}]{" "}
                                    </span>
                                  )}
                                  {l.jobType ? l.jobType + " · " : ""}
                                  {l.name}
                                  {mid ? " · " + mid : ""}
                                  {showTax && (
                                    <span className={`tax-badge ${l.taxInvoice ? "issued" : "pending"}`}>
                                      {l.taxInvoice ? "계산서 발행" : "계산서 미발행"}
                                    </span>
                                  )}
                                </div>
                                <div className="lg-sub" style={{ textAlign: "left", margin: 0 }}>
                                  {fmtDate(l.date)}
                                  {l.vendor ? " · " + l.vendor : ""}
                                  {l.note ? " · " + l.note : ""}
                                </div>
                              </div>
                              {RECEIPT_TYPES.includes(l.type) && (
                                <div
                                  className="lg-edit"
                                  style={l.receipt ? { color: "var(--blueprint-light)" } : undefined}
                                  onClick={() =>
                                    receiptBusyId === l.id
                                      ? undefined
                                      : l.receipt
                                      ? viewReceipt(l.id)
                                      : triggerReceiptUpload(l.id)
                                  }
                                >
                                  {receiptBusyId === l.id ? "…" : "🧾"}
                                </div>
                              )}
                              <div className="lg-edit" onClick={() => startEditLog(l)}>
                                ✎
                              </div>
                              <div className="lg-del" onClick={() => handleDeleteLog(l.id)}>
                                ✕
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {TYPES_ORDER.map((t) => (
              <datalist id={`lg_name_options_${t}`} key={t}>
                {knownNames
                  .filter((k) => k.type === t)
                  .map((k) => (
                    <option key={k.name} value={k.name} />
                  ))}
              </datalist>
            ))}
            <datalist id="lg_jobtype_options">
              {knownJobTypes.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>

            <div
              className="wi-summary"
              style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              onClick={() => setShowManualForm((v) => !v)}
            >
              <span style={{ flex: 1 }}>개별 항목 직접 추가 (자재·식대·잡자재, 수정 등)</span>
              <span className={`chevron ${showManualForm ? "open" : ""}`}>▸</span>
            </div>

            {showManualForm && (
            <>
            <div className="lg-add">
              <select value={logForm.type} onChange={(e) => onLgTypeChange(e.target.value)}>
                <option value="인력">인력</option>
                <option value="장비">장비</option>
                <option value="자재">자재대(반입)</option>
                <option value="식대">식대</option>
                <option value="참">참</option>
                <option value="운반비">운반비</option>
                <option value="잡자재">잡자재비</option>
              </select>
              {selectableWorkItems.length > 0 ? (
                <select
                  className="lg-workitem-select"
                  value={logForm.workItemId}
                  onChange={(e) => setLogForm({ ...logForm, workItemId: e.target.value })}
                >
                  <option value="">공종 선택안함</option>
                  {selectableWorkItems.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {w.spec ? ` (${w.spec})` : ""} · 예산 {formatWon(w.amount)}원
                    </option>
                  ))}
                </select>
              ) : null}
              {isPersonType && (
                <input
                  className="lg-jobtype-input"
                  type="text"
                  list="lg_jobtype_options"
                  placeholder="직종 (예: 조경공)"
                  value={logForm.jobType}
                  onChange={(e) => setLogForm({ ...logForm, jobType: e.target.value })}
                />
              )}
              {logForm.type === "장비" && (
                <input
                  className="lg-jobtype-input"
                  type="text"
                  placeholder="이름 (운전자, 선택)"
                  value={logForm.jobType}
                  onChange={(e) => setLogForm({ ...logForm, jobType: e.target.value })}
                />
              )}
              <input
                className="lg-name-input"
                type="text"
                list={`lg_name_options_${logForm.type}`}
                placeholder={NAME_PLACEHOLDER[logForm.type] || "항목명"}
                value={logForm.name}
                onChange={(e) => onLgNameChange(e.target.value)}
              />
              <input
                type="number"
                step={0.5}
                min={0}
                placeholder={isLaborType ? "공수" : "수량"}
                value={logForm.qty}
                onChange={(e) => setLogForm({ ...logForm, qty: e.target.value })}
              />
              <input
                className="lg-unit-input"
                type="text"
                placeholder="단위"
                value={logForm.unit}
                onChange={(e) => setLogForm({ ...logForm, unit: e.target.value })}
              />
              {isLaborType && (
                <input
                  className="lg-rate-input"
                  type="number"
                  placeholder="단가(원)"
                  value={logForm.rate}
                  onChange={(e) => setLogForm({ ...logForm, rate: e.target.value })}
                />
              )}
              {!isLaborType && (
                <input
                  className="lg-amount-input"
                  type="number"
                  placeholder="금액(원)"
                  value={logForm.amount}
                  onChange={(e) => setLogForm({ ...logForm, amount: e.target.value })}
                />
              )}
              <input
                type="date"
                value={logForm.date}
                onChange={(e) => setLogForm({ ...logForm, date: e.target.value })}
              />
              <input
                className="lg-note-input"
                type="text"
                placeholder="비고 (선택)"
                value={logForm.note}
                onChange={(e) => setLogForm({ ...logForm, note: e.target.value })}
              />
              {VENDOR_TYPES.includes(logForm.type) && (
                <input
                  type="text"
                  placeholder="업체명"
                  value={logForm.vendor}
                  onChange={(e) => setLogForm({ ...logForm, vendor: e.target.value })}
                />
              )}
              {isMaterialType && (
                <div className="lg-tax-row">
                  <input
                    type="checkbox"
                    id="lg_new_tax"
                    checked={logForm.taxInvoice}
                    onChange={(e) => setLogForm({ ...logForm, taxInvoice: e.target.checked })}
                  />
                  <label htmlFor="lg_new_tax">세금계산서 발행됨 (자재비·운반비 등)</label>
                </div>
              )}
              <button onClick={handleSubmitLaborLog}>{editingLogId ? "수정 저장" : "추가"}</button>
              {editingLogId && (
                <span className="lg-cancel" onClick={cancelEditLog}>
                  취소
                </span>
              )}
            </div>
            {isLaborType && <div className="lg-sum">합계: {formatWon(lgTotal)}원</div>}
            </>
            )}
          </>
        )}

        <button className="btn-primary" onClick={handleSaveFields} disabled={saving}>
          {isEdit ? "저장" : "등록"}
        </button>
        {savedFlash && (
          <div style={{ textAlign: "center", color: "var(--sinjin)", fontSize: 12, marginTop: -4 }}>
            ✓ 저장됐어요 — 계속 수정하실 수 있어요
          </div>
        )}
        {isEdit && (
          <button className="btn-danger" onClick={handleDeleteProject}>
            공사 삭제
          </button>
        )}
        <button className="btn-ghost" onClick={onClose}>
          닫기
        </button>
        {isEdit && !project?.completed && (
          <button className="btn-primary" onClick={() => handleToggleCompleted(true)}>
            ✅ 공사완료
          </button>
        )}
        {isEdit && project?.completed && (
          <button className="btn-ghost" onClick={() => handleToggleCompleted(false)}>
            ↩️ 진행중으로 되돌리기
          </button>
        )}
      </div>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={receiptInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleReceiptFile(file);
          e.target.value = "";
        }}
      />

      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={dailyReceiptInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleDailyReceiptFile(file);
          e.target.value = "";
        }}
      />

      <input
        type="file"
        accept="image/*"
        ref={dailyGalleryInputRef}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleDailyReceiptFile(file);
          e.target.value = "";
        }}
      />

      {viewingReceipt && (
        <div
          className="overlay open"
          style={{ zIndex: 200 }}
          onClick={(e) => e.target === e.currentTarget && setViewingReceipt(null)}
        >
          <div className="sheet" style={{ maxWidth: 520, textAlign: "center" }}>
            <div className="sheet-handle" />
            <h2>영수증</h2>
            <img
              src={viewingReceipt}
              alt="영수증"
              style={{ width: "100%", borderRadius: 8, marginBottom: 12 }}
            />
            {pendingReceiptLogId && (
              <button className="btn-danger" onClick={() => deleteReceipt(pendingReceiptLogId)}>
                영수증 삭제
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => {
                setViewingReceipt(null);
                setPendingReceiptLogId(null);
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
