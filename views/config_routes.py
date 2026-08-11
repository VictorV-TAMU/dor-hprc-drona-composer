from flask import Blueprint, render_template
from flask import jsonify, request, current_app
from pathlib import Path
from tempfile import NamedTemporaryFile
import os, json

from .utils import get_drona_config, probe_and_autofix_config, _write_config_json_atomically, maybe_migrate_legacy_history

def config_status():
    out = probe_and_autofix_config() 
    if out.get("action") == "migrated":
        try:
            h = maybe_migrate_legacy_history()
        except Exception:
            h = {"ran": True, "success": False}
        
        if h.get("success") is True:
            out["notice"] = (out.get("notice") or "") + " Also migrated your prior job history."
        elif h.get("ran") is True and h.get("success") is False:
            out["notice"] = (out.get("notice") or "") + " Config migrated, but job history migration failed; you can continue normally."
        out["history_migration"] = h
    
    return jsonify(out), 200

def config_save():
    if not request.is_json:
        return jsonify({"status":"error","message":"Request must be JSON"}), 400

    base = (request.get_json(silent=True) or {}).get("drona_dir", "")
    if not isinstance(base, str):
        return jsonify({"status":"error","message":"'drona_dir' must be a string"}), 400
    base = base.strip()
    if not base:
        return jsonify({"status":"error","message":"Missing 'drona_dir'"}), 400

    # Preserve a selected symlink's name so an existing drona_wfe alias does not
    # become drona_composer/drona_wfe after resolution.
    base_path = Path(os.path.abspath(Path(base).expanduser()))
    if not base_path.exists() or not base_path.is_dir():
        return jsonify({"status":"error","message":f"Directory does not exist: {base_path}"}), 400

    target = base_path if base_path.name == "drona_wfe" else base_path / "drona_wfe"
    try:
        target.mkdir(parents=True, exist_ok=True)
        # Prove write access using the same kind of operation Drona needs later.
        with NamedTemporaryFile(prefix=".drona-write-test-", dir=target):
            pass
    except OSError as e:
        return jsonify({"status":"error","message":f"Drona directory is not writable: {target}: {e}"}), 400

    try:
        _write_config_json_atomically(str(target))
    except Exception as e:
        return jsonify({"status":"error","message":f"Failed to save configuration: {e}"}), 500

    return jsonify({
        "status":"ok",
        "drona_dir": str(target),
        "message": f"Drona will store its data in '{target}'."
    }), 200

def register_config_routes(blueprint):
    """Register all config-related routes to the blueprint"""
    blueprint.route('/api/config/status', methods=['GET'])(config_status)
    blueprint.route('/api/config/save', methods=['POST'])(config_save)
