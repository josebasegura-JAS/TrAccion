"""Clonación local y explícita de un backup SQLite de TrAcción a PRUEBAS."""
import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import sqlite3
import sys
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from uuid import UUID, uuid4

MAX_SCHEMA_VERSION = 19
BACKUP_NAME = re.compile(
    r"traccion-(?:local-backup(?:-[\w-]+)?|shutdown-backup-[\w-]+|backup-[\w-]+|daily-[a-z]+)\.sqlite",
    re.IGNORECASE,
)
IDENTITY_KEYS = ("application_id", "database_uuid", "database_created_at", "environment")
CORE_TABLES = {"schema_migrations", "persisted_records", "app_metadata", "editing_locks"}


def stat_stamp(st):
    return (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns)


def no_sidecars(file):
    for suffix in ("-wal", "-shm", "-journal"):
        if os.path.lexists(str(file) + suffix):
            raise ValueError("El respaldo tiene archivos auxiliares SQLite. Genera un backup terminado.")


def check_backup_source(source):
    source = Path(source)
    if not BACKUP_NAME.fullmatch(source.name):
        raise ValueError("Selecciona un backup SQLite de TrAcción, nunca traccion.sqlite activo.")
    real = source.resolve(strict=True)
    if not real.is_file() or not BACKUP_NAME.fullmatch(real.name):
        raise ValueError("El origen no es un archivo de backup admitido.")
    live = real.parent / "traccion.sqlite"
    if live.exists() and real.samefile(live):
        raise ValueError("El origen coincide con la base activa.")
    no_sidecars(source)
    no_sidecars(real)
    return real


def copy_stable_backup(source, local):
    # El original se abre solo como archivo de lectura. Nunca se abre SQLite
    # sobre el origen SMB ni se copian archivos WAL/SHM o lockdir.
    before = source.stat()
    with source.open("rb") as inp, local.open("xb") as out:
        if stat_stamp(os.fstat(inp.fileno())) != stat_stamp(before):
            raise ValueError("El respaldo cambió antes de comenzar; repite con una copia terminada.")
        shutil.copyfileobj(inp, out, 1024 * 1024)
        if stat_stamp(os.fstat(inp.fileno())) != stat_stamp(before):
            raise ValueError("El respaldo cambió durante la lectura.")
    if stat_stamp(source.stat()) != stat_stamp(before) or local.stat().st_size != before.st_size:
        raise ValueError("El respaldo cambió durante la copia.")
    no_sidecars(source)


def validate(db, environment):
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not CORE_TABLES <= tables:
        raise ValueError("No contiene las tablas mínimas de TrAcción.")
    if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
        raise ValueError("SQLite no supera integrity_check.")
    version = db.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
    if not isinstance(version, int) or not 1 <= version <= MAX_SCHEMA_VERSION:
        raise ValueError(f"Versión de esquema no admitida: {version}.")
    metadata = dict(db.execute("SELECT key, value FROM app_metadata"))
    if not all(isinstance(metadata.get(k), str) and metadata[k].strip() for k in IDENTITY_KEYS):
        raise ValueError("Identidad SQLite incompleta.")
    if metadata["application_id"] != "TrAccion" or metadata["environment"] != environment:
        raise ValueError(f"Se exige una base TrAcción de entorno {environment}.")
    try:
        if UUID(metadata["database_uuid"]).int == 0:
            raise ValueError()
    except ValueError as exc:
        raise ValueError("UUID SQLite no válido.") from exc
    return metadata, version


def sha256(file):
    digest = hashlib.sha256()
    with file.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.digest()


def clone_backup(source, destination_parent):
    source = check_backup_source(source)
    parent = Path(destination_parent).resolve(strict=True)
    if not parent.is_dir():
        raise ValueError("Selecciona una carpeta de destino existente.")
    # No crear salidas dentro de una carpeta de base activa, ni sus subcarpetas.
    for directory in (parent, *parent.parents):
        if os.path.lexists(directory / "traccion.sqlite"):
            raise ValueError("El destino está dentro de una carpeta de base activa. Selecciona otra carpeta.")
    new_uuid = str(uuid4())
    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    folder = parent / ("TrAccion_PRUEBAS_" + datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + new_uuid[:8])
    # El fichero final solo aparece después de verificar una instantánea local
    # y la copia al destino. No se sustituye ninguna carpeta o base previa.
    with tempfile.TemporaryDirectory(prefix="traccion-clone-") as temp:
        local_source = Path(temp) / "source.sqlite"
        local_clone = Path(temp) / "clone.sqlite"
        copy_stable_backup(source, local_source)
        with closing(sqlite3.connect(local_source.as_uri() + "?mode=ro", uri=True, timeout=5)) as src:
            metadata, version = validate(src, "production")
            with closing(sqlite3.connect(local_clone, timeout=5)) as dst:
                src.backup(dst)
                dst.execute("PRAGMA journal_mode=DELETE")
                with dst:
                    for key, value in (
                        ("database_uuid", new_uuid),
                        ("environment", "test"),
                        ("database_created_at", now),
                    ):
                        changed = dst.execute(
                            "UPDATE app_metadata SET value=?, updated_at=? WHERE key=?",
                            (value, now, key),
                        )
                        if changed.rowcount != 1:
                            raise ValueError("No se pudo actualizar la identidad de la copia.")
                    dst.execute("DELETE FROM editing_locks")
                result, cloned_version = validate(dst, "test")
                if result["database_uuid"] != new_uuid or new_uuid == metadata["database_uuid"] or version != cloned_version:
                    raise ValueError("No se confirmó la identidad independiente.")
                if dst.execute("SELECT COUNT(*) FROM editing_locks").fetchone()[0]:
                    raise ValueError("La copia conserva bloqueos de edición.")
        no_sidecars(local_clone)
        digest = sha256(local_clone)
        folder.mkdir(exist_ok=False)
        pending = folder / "traccion.sqlite.pending"
        final = folder / "traccion.sqlite"
        try:
            with local_clone.open("rb") as inp, pending.open("xb") as out:
                shutil.copyfileobj(inp, out, 1024 * 1024)
                out.flush()
                os.fsync(out.fileno())
            if sha256(pending) != digest:
                raise ValueError("La copia en el destino no coincide con la instantánea verificada.")
            if os.path.lexists(final):
                raise ValueError("El destino apareció durante la copia. No se sobrescribirá.")
            pending.rename(final)
        except BaseException:
            # Solo eliminar nuestro temporal y una carpeta recién creada vacía.
            pending.unlink(missing_ok=True)
            try:
                folder.rmdir()
            except OSError:
                pass
            raise
    return final


def gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    from threading import Thread
    from queue import Queue, Empty

    root = tk.Tk()
    root.title("TrAcción · Clonar backup a PRUEBAS")
    root.geometry("640x290")
    root.resizable(False, False)
    source = tk.StringVar()
    destination = tk.StringVar()
    status = tk.StringVar(value="Selecciona un respaldo terminado y una carpeta independiente.")
    frame = ttk.Frame(root, padding=20)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text="Clonar base de producción para PRUEBAS", font=("Segoe UI", 14, "bold")).pack(anchor="w")
    ttk.Label(frame, text="Solo se lee el backup. Nunca se modifica producción.").pack(anchor="w", pady=(3, 12))

    def field(label, variable, choose):
        ttk.Label(frame, text=label).pack(anchor="w")
        row = ttk.Frame(frame)
        row.pack(fill="x", pady=(0, 10))
        ttk.Entry(row, textvariable=variable, state="readonly").pack(side="left", fill="x", expand=True)
        button = ttk.Button(row, text="Examinar...", command=choose)
        button.pack(side="left", padx=(8, 0))
        return button

    source_button = field("Backup SQLite de producción", source, lambda: source.set(
        filedialog.askopenfilename(filetypes=[("Backup SQLite", "*.sqlite")]) or source.get()))
    dest_button = field("Carpeta padre de pruebas (se creará una subcarpeta nueva)", destination, lambda: destination.set(
        filedialog.askdirectory(mustexist=True) or destination.get()))
    result = Queue()
    busy = False

    def run():
        nonlocal busy
        if not source.get() or not destination.get():
            messagebox.showwarning("Faltan datos", "Selecciona el backup y la carpeta de destino.")
            return
        if not messagebox.askyesno("Confirmar copia",
            "La copia contendrá datos reales, incluidos datos personales y configuraciones. "
            "Confirma que tienes autorización, que el destino tiene acceso restringido "
            "y que no realizarás envíos reales desde PRUEBAS."):
            return
        busy = True
        for b in (source_button, dest_button, create_button):
            b.configure(state="disabled")
        status.set("Copiando y comprobando integridad. No cierres esta ventana.")
        progress.start(12)
        src, dest = source.get(), destination.get()

        def work():
            try:
                result.put((True, str(clone_backup(src, dest))))
            except Exception as exc:
                result.put((False, str(exc)))

        def poll():
            nonlocal busy
            try:
                ok, message = result.get_nowait()
            except Empty:
                root.after(150, poll)
                return
            busy = False
            progress.stop()
            for b in (source_button, dest_button, create_button):
                b.configure(state="normal")
            status.set("Copia verificada." if ok else "No se ha creado una base válida.")
            if ok:
                root.clipboard_clear()
                root.clipboard_append(str(Path(message).parent))
                messagebox.showinfo("Base de PRUEBAS preparada", message +
                    "\n\nLa ruta de la carpeta se ha copiado al portapapeles. "
                    "Vincúlala desde el EXE experimental; si ya había otra base test vinculada, sigue la guía.")
            else:
                messagebox.showerror("No se pudo clonar", message)
        Thread(target=work, daemon=False).start()
        root.after(150, poll)

    create_button = ttk.Button(frame, text="Crear base de PRUEBAS", command=run)
    create_button.pack(anchor="w")
    progress = ttk.Progressbar(frame, mode="indeterminate")
    progress.pack(fill="x", pady=(8, 4))
    ttk.Label(frame, textvariable=status, wraplength=590).pack(anchor="w")
    root.protocol("WM_DELETE_WINDOW", lambda: messagebox.showwarning("Copia en curso", "Espera a que termine la operación.") if busy else root.destroy())
    root.mainloop()


def main():
    if len(sys.argv) == 1:
        gui()
        return 0
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--destination-parent", required=True)
    parser.add_argument("--confirm-authorized", action="store_true", required=True)
    args = parser.parse_args()
    try:
        result = clone_backup(args.source, args.destination_parent)
        if sys.stdout is not None:
            print(result)
        return 0
    except Exception as exc:
        if sys.stderr is not None:
            print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
