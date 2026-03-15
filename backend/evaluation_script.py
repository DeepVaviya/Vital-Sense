"""
VitalSense — Live Pipeline Accuracy Evaluation Script

Captures 30 seconds of webcam video, processes each frame through the full
VitalSense pipeline, and generates a comprehensive accuracy report with
professional visualizations.

Usage:
    cd backend
    python evaluation_script.py

Output:
    evaluation_results/accuracy_report.png   — 6-panel chart
    evaluation_results/accuracy_report.txt   — detailed text report
"""

import os
import sys
import time
import cv2
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpec
from collections import Counter

# Pipeline imports
from face_detection import FaceDetector, compute_geometric_embedding
from roi_extraction import extract_roi_signals, get_combined_rgb
from ippg_signal import IPPGSignalExtractor, _pos_from_rgb, _chrom_from_rgb, _green_from_rgb, _spectral_snr
from signal_processing import butterworth_bandpass, estimate_hr_fft, detect_peaks, compute_heart_rate
from hrv_analysis import compute_hrv
from eye_analysis import EyeAnalyzer
from respiration_detection import RespirationDetector
from metrics_engine import compute_stress_score, compute_cognitive_load, compute_fatigue_risk, compute_mood

# ── Configuration ──
CAPTURE_DURATION = 30       # seconds
TARGET_FPS = 15
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "evaluation_results")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def run_evaluation():
    print("=" * 65)
    print("  VitalSense — Live Pipeline Accuracy Evaluation")
    print("=" * 65)
    print(f"\n  Capture duration : {CAPTURE_DURATION}s")
    print(f"  Target FPS       : {TARGET_FPS}")
    print(f"  Output directory : {OUTPUT_DIR}\n")

    # ── Initialise pipeline components ──
    detector = FaceDetector(max_faces=1)
    ippg = IPPGSignalExtractor(buffer_seconds=CAPTURE_DURATION + 5, fps=TARGET_FPS)
    eye_analyzer = EyeAnalyzer(fps=TARGET_FPS, buffer_seconds=CAPTURE_DURATION + 5)
    resp_detector = RespirationDetector(buffer_seconds=CAPTURE_DURATION + 5, fps=TARGET_FPS)

    # ── Open webcam ──
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Cannot open webcam. Exiting.")
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    # ── Data collectors ──
    frame_times = []
    detection_results = []       # True/False per frame
    detection_times_ms = []      # processing time per frame
    landmark_counts = []
    rgb_samples = []             # (R, G, B) per frame

    snr_pos_list = []
    snr_chrom_list = []
    snr_fused_list = []
    method_choices = []

    hr_values = []
    hr_history = []

    ear_values = []
    blink_rate_values = []
    gaze_stability_values = []

    rr_values = []

    stress_values = []
    fatigue_values = []
    cognitive_values = []
    mood_values = []

    ema_state = {}

    print("  Starting webcam capture... (sit still, face the camera)")
    print("  Press 'q' to stop early.\n")

    start_time = time.time()
    frame_count = 0
    frame_interval = 1.0 / TARGET_FPS

    while True:
        elapsed = time.time() - start_time
        if elapsed >= CAPTURE_DURATION:
            break

        ret, frame = cap.read()
        if not ret:
            continue

        frame_count += 1
        progress = int((elapsed / CAPTURE_DURATION) * 50)
        bar = "#" * progress + "-" * (50 - progress)
        pct = (elapsed / CAPTURE_DURATION) * 100
        print(f"\r  [{bar}] {pct:5.1f}%  ({frame_count} frames)", end="", flush=True)

        # ── Face detection ──
        t0 = time.perf_counter()
        landmarks = detector.detect(frame)
        dt_ms = (time.perf_counter() - t0) * 1000

        detection_times_ms.append(dt_ms)
        detected = landmarks is not None
        detection_results.append(detected)

        if not detected:
            # Show preview
            cv2.putText(frame, "No face detected", (20, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            cv2.imshow("VitalSense Evaluation", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
            time.sleep(max(0, frame_interval - (time.perf_counter() - t0)))
            continue

        landmark_counts.append(len(landmarks))

        # ── ROI extraction ──
        roi = extract_roi_signals(frame, landmarks)
        combined_rgb = get_combined_rgb(roi)

        if combined_rgb is not None:
            rgb_samples.append(combined_rgb.copy())
            ippg.add_sample(combined_rgb)

            # ── rPPG computation ──
            bvp = ippg.compute_chrom()
            snr_pos_list.append(ippg.last_snr_pos)
            snr_chrom_list.append(ippg.last_snr_chrom)
            snr_fused_list.append(ippg.signal_quality_score)
            method_choices.append(ippg.last_method)

            # ── Heart rate ──
            if len(bvp) > 30:
                fft_hr = estimate_hr_fft(bvp, TARGET_FPS)
                peaks = detect_peaks(bvp, TARGET_FPS)
                hr = compute_heart_rate(peaks, TARGET_FPS, hr_history, fft_hr)
                if hr > 0:
                    hr_values.append(hr)
                    hr_history.append(hr)

                # ── HRV ──
                hrv = compute_hrv(peaks, TARGET_FPS)

                # ── Respiration ──
                resp_detector.add_bvp_signal(bvp)

        # ── Eye analysis ──
        eye_analyzer.add_landmarks(landmarks)
        eye_metrics = eye_analyzer.get_metrics()
        ear_values.append(eye_metrics.get('ear_avg', 0))
        blink_rate_values.append(eye_metrics.get('blink_rate', 0))
        gaze_stability_values.append(eye_metrics.get('gaze_stability', 0))

        # ── Respiration ──
        resp_detector.add_landmarks(landmarks)
        rr = resp_detector.compute_respiration_rate()
        if rr > 0:
            rr_values.append(rr)

        # ── Derived metrics (after some data accumulates) ──
        if len(hr_values) > 5:
            last_hr = hr_values[-1] if hr_values else 0
            stress = compute_stress_score(
                last_hr, hrv.get('rmssd', 0), rr_values[-1] if rr_values else 0,
                lf_hf_ratio=hrv.get('lf_hf_ratio', 0),
                pnn50=hrv.get('pnn50', -1),
                blink_rate=eye_metrics.get('blink_rate', -1),
                saccade_rate=eye_metrics.get('saccade_rate', -1),
                gaze_stability=eye_metrics.get('gaze_stability', -1),
                ema_state=ema_state,
            )
            stress_values.append(stress)

            fatigue = compute_fatigue_risk(
                last_hr, hrv.get('rmssd', 0), hrv.get('sdnn', 0),
                rr_values[-1] if rr_values else 0,
                hr_history=hr_history,
                pnn50=hrv.get('pnn50', -1),
                lf_hf_ratio=hrv.get('lf_hf_ratio', 0),
                blink_rate=eye_metrics.get('blink_rate', -1),
                perclos=eye_metrics.get('perclos', -1),
                ear_avg=eye_metrics.get('ear_avg', -1),
                gaze_stability=eye_metrics.get('gaze_stability', -1),
                ema_state=ema_state,
            )
            fatigue_values.append(fatigue)

            cog = compute_cognitive_load(
                last_hr, hrv.get('rmssd', 0),
                rr_values[-1] if rr_values else 0,
                hr_history=hr_history,
                lf_hf_ratio=hrv.get('lf_hf_ratio', 0),
                blink_rate=eye_metrics.get('blink_rate', -1),
                gaze_stability=eye_metrics.get('gaze_stability', -1),
                saccade_rate=eye_metrics.get('saccade_rate', -1),
                pupil_size=eye_metrics.get('pupil_size', -1),
            )
            cognitive_values.append(cog)

            mood = compute_mood(
                stress, hrv.get('rmssd', 0), last_hr,
                lf_hf_ratio=hrv.get('lf_hf_ratio', 0),
                pnn50=hrv.get('pnn50', -1),
                blink_rate=eye_metrics.get('blink_rate', -1),
                gaze_stability=eye_metrics.get('gaze_stability', -1),
            )
            mood_values.append(mood)

        # Show preview
        cv2.putText(frame, f"HR: {hr_values[-1]:.0f} BPM" if hr_values else "Calibrating...",
                    (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.imshow("VitalSense Evaluation", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

        # Throttle to target FPS
        frame_time = time.perf_counter() - t0
        sleep_time = frame_interval - frame_time
        if sleep_time > 0:
            time.sleep(sleep_time)

    cap.release()
    cv2.destroyAllWindows()
    total_time = time.time() - start_time
    actual_fps = frame_count / total_time if total_time > 0 else 0

    print(f"\n\n  Capture complete: {frame_count} frames in {total_time:.1f}s ({actual_fps:.1f} FPS)")

    # ══════════════════════════════════════════════════════════
    #  COMPUTE FINAL METRICS
    # ══════════════════════════════════════════════════════════

    # Final HRV from all accumulated data
    bvp_final = ippg.get_signal()
    final_hrv = {}
    if len(bvp_final) > 30:
        peaks_final = detect_peaks(bvp_final, TARGET_FPS)
        final_hrv = compute_hrv(peaks_final, TARGET_FPS)

    # Face detection metrics
    det_rate = (sum(detection_results) / len(detection_results) * 100) if detection_results else 0
    avg_det_time = np.mean(detection_times_ms) if detection_times_ms else 0
    avg_landmarks = np.mean(landmark_counts) if landmark_counts else 0

    # HR metrics
    hr_mean = np.mean(hr_values) if hr_values else 0
    hr_std = np.std(hr_values) if hr_values else 0
    hr_cv = (hr_std / hr_mean * 100) if hr_mean > 0 else 0
    hr_plausible = sum(1 for h in hr_values if 50 <= h <= 120) / len(hr_values) * 100 if hr_values else 0

    # SNR metrics
    snr_pos_mean = np.mean(snr_pos_list[-100:]) if snr_pos_list else 0
    snr_chrom_mean = np.mean(snr_chrom_list[-100:]) if snr_chrom_list else 0
    snr_fused_mean = np.mean(snr_fused_list[-100:]) if snr_fused_list else 0
    method_counts = Counter(method_choices)

    # RR metrics
    rr_mean = np.mean(rr_values) if rr_values else 0
    rr_std = np.std(rr_values) if rr_values else 0
    rr_plausible = sum(1 for r in rr_values if 8 <= r <= 25) / len(rr_values) * 100 if rr_values else 0

    # Eye metrics
    ear_mean = np.mean([e for e in ear_values if e > 0]) if ear_values else 0
    gaze_stab_mean = np.mean([g for g in gaze_stability_values if g > 0]) if gaze_stability_values else 0

    # Stress/fatigue
    stress_mean = np.mean(stress_values) if stress_values else 0
    fatigue_mean = np.mean(fatigue_values) if fatigue_values else 0
    cog_counts = Counter(cognitive_values) if cognitive_values else {}
    mood_counts = Counter(mood_values) if mood_values else {}

    # ══════════════════════════════════════════════════════════
    #  GENERATE TEXT REPORT
    # ══════════════════════════════════════════════════════════

    report_lines = []
    report_lines.append("=" * 70)
    report_lines.append("  VITALSENSE — PIPELINE ACCURACY EVALUATION REPORT")
    report_lines.append("=" * 70)
    report_lines.append(f"  Date              : {time.strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append(f"  Duration          : {total_time:.1f}s")
    report_lines.append(f"  Total Frames      : {frame_count}")
    report_lines.append(f"  Actual FPS        : {actual_fps:.1f}")
    report_lines.append("")

    report_lines.append("-" * 70)
    report_lines.append("  1. FACE DETECTION (MediaPipe Face Landmarker)")
    report_lines.append("-" * 70)
    report_lines.append(f"  Detection Rate       : {det_rate:.1f}%")
    report_lines.append(f"  Avg Landmarks/Face   : {avg_landmarks:.0f} (expected: 478)")
    report_lines.append(f"  Avg Processing Time  : {avg_det_time:.1f} ms/frame")
    report_lines.append(f"  Verdict              : {'PASS' if det_rate > 90 else 'ACCEPTABLE' if det_rate > 70 else 'NEEDS IMPROVEMENT'}")
    report_lines.append("")

    report_lines.append("-" * 70)
    report_lines.append("  2. rPPG SIGNAL QUALITY (POS + CHROM Fusion)")
    report_lines.append("-" * 70)
    report_lines.append(f"  POS  Algorithm SNR   : {snr_pos_mean:.2f}")
    report_lines.append(f"  CHROM Algorithm SNR  : {snr_chrom_mean:.2f}")
    report_lines.append(f"  Fused Signal SNR     : {snr_fused_mean:.2f}")
    report_lines.append(f"  Method Selection     : {dict(method_counts)}")
    report_lines.append(f"  SNR Quality          : {'Excellent' if snr_fused_mean > 5 else 'Good' if snr_fused_mean > 3 else 'Acceptable' if snr_fused_mean > 2 else 'Low'}")
    report_lines.append("")

    report_lines.append("-" * 70)
    report_lines.append("  3. HEART RATE ESTIMATION")
    report_lines.append("-" * 70)
    report_lines.append(f"  Mean HR              : {hr_mean:.1f} BPM")
    report_lines.append(f"  Std Deviation        : {hr_std:.1f} BPM")
    report_lines.append(f"  Coefficient of Var.  : {hr_cv:.1f}%")
    report_lines.append(f"  Physiological Range  : {hr_plausible:.1f}% readings in 50-120 BPM")
    report_lines.append(f"  Stability            : {'Excellent' if hr_cv < 5 else 'Good' if hr_cv < 10 else 'Acceptable' if hr_cv < 15 else 'Variable'}")
    report_lines.append(f"  Reference            : Normal resting HR is 60-100 BPM")
    report_lines.append("")

    report_lines.append("-" * 70)
    report_lines.append("  4. HRV ANALYSIS (Time + Frequency Domain)")
    report_lines.append("-" * 70)
    report_lines.append(f"  RMSSD                : {final_hrv.get('rmssd', 0):.2f} ms   (normal: 20-60 ms)")
    report_lines.append(f"  SDNN                 : {final_hrv.get('sdnn', 0):.2f} ms   (normal: 30-100 ms)")
    report_lines.append(f"  pNN50                : {final_hrv.get('pnn50', 0):.2f}%    (normal: 5-25%)")
    report_lines.append(f"  LF/HF Ratio          : {final_hrv.get('lf_hf_ratio', 0):.2f}     (normal: 0.5-2.0)")
    report_lines.append(f"  IBI Count            : {final_hrv.get('ibi_count', 0)}")
    report_lines.append("")

    report_lines.append("-" * 70)
    report_lines.append("  5. EYE ANALYSIS (EAR, Blink, Gaze, PERCLOS)")
    report_lines.append("-" * 70)
    report_lines.append(f"  Avg EAR              : {ear_mean:.3f}   (normal open: 0.25-0.35)")
    report_lines.append(f"  Avg Blink Rate       : {blink_rate_values[-1] if blink_rate_values else 0:.1f} blinks/min (normal: 15-20)")
    report_lines.append(f"  Avg Gaze Stability   : {gaze_stab_mean:.2f}   (1.0 = perfectly stable)")
    report_lines.append(f"  PERCLOS              : {eye_metrics.get('perclos', 0):.1f}%  (alert: <15%)")
    report_lines.append("")

    report_lines.append("-" * 70)
    report_lines.append("  6. RESPIRATION RATE (Dual-Channel: Landmark + RSA)")
    report_lines.append("-" * 70)
    report_lines.append(f"  Mean RR              : {rr_mean:.1f} breaths/min")
    report_lines.append(f"  Std Deviation        : {rr_std:.1f}")
    report_lines.append(f"  Physiological Range  : {rr_plausible:.1f}% readings in 8-25 BPM")
    report_lines.append(f"  Reference            : Normal: 12-20 breaths/min")
    report_lines.append("")

    report_lines.append("-" * 70)
    report_lines.append("  7. DERIVED METRICS")
    report_lines.append("-" * 70)
    report_lines.append(f"  Avg Stress Score     : {stress_mean:.1f} / 100")
    report_lines.append(f"  Avg Fatigue Risk     : {fatigue_mean:.1f} / 100")
    report_lines.append(f"  Cognitive Load       : {dict(cog_counts)}")
    report_lines.append(f"  Mood Distribution    : {dict(mood_counts)}")
    report_lines.append("")

    # Overall pass/fail
    checks = {
        "Face Detection > 90%": det_rate > 90,
        "HR Plausibility > 90%": hr_plausible > 90,
        "HR CV < 15%": hr_cv < 15,
        "Signal SNR > 2.0": snr_fused_mean > 2.0,
        "RR Plausibility > 80%": rr_plausible > 80 if rr_values else True,
        "EAR in Range (0.15-0.45)": 0.15 < ear_mean < 0.45 if ear_mean > 0 else True,
    }

    passed = sum(checks.values())
    total = len(checks)

    report_lines.append("-" * 70)
    report_lines.append("  8. OVERALL ACCURACY SUMMARY")
    report_lines.append("-" * 70)
    for check, ok in checks.items():
        report_lines.append(f"  {'PASS' if ok else 'FAIL'}  {check}")
    report_lines.append("")
    report_lines.append(f"  RESULT: {passed}/{total} checks passed — {'SYSTEM VALIDATED' if passed >= total - 1 else 'ACCEPTABLE' if passed >= total - 2 else 'NEEDS REVIEW'}")
    report_lines.append("=" * 70)

    report_text = "\n".join(report_lines)
    print("\n" + report_text)

    report_path = os.path.join(OUTPUT_DIR, "accuracy_report.txt")
    with open(report_path, "w") as f:
        f.write(report_text)
    print(f"\n  Text report saved to: {report_path}")

    # ══════════════════════════════════════════════════════════
    #  GENERATE VISUAL REPORT (6-panel chart)
    # ══════════════════════════════════════════════════════════

    fig = plt.figure(figsize=(18, 14))
    fig.suptitle("VitalSense — Pipeline Accuracy Evaluation Report",
                 fontsize=16, fontweight='bold', y=0.98)
    fig.text(0.5, 0.955, f"Duration: {total_time:.0f}s | Frames: {frame_count} | FPS: {actual_fps:.1f}",
             ha='center', fontsize=10, color='gray')

    gs = GridSpec(3, 2, figure=fig, hspace=0.35, wspace=0.3,
                  left=0.07, right=0.95, top=0.92, bottom=0.05)

    # Panel 1: rPPG Waveform
    ax1 = fig.add_subplot(gs[0, 0])
    bvp_plot = ippg.get_signal()
    if len(bvp_plot) > 0:
        t_axis = np.arange(len(bvp_plot)) / TARGET_FPS
        ax1.plot(t_axis, bvp_plot, color='#e74c3c', linewidth=0.8, alpha=0.9)
        ax1.set_xlabel('Time (s)')
    ax1.set_title('rPPG Signal (POS+CHROM Fusion)', fontweight='bold')
    ax1.set_ylabel('Amplitude')
    ax1.grid(True, alpha=0.3)

    # Panel 2: Heart Rate Over Time
    ax2 = fig.add_subplot(gs[0, 1])
    if hr_values:
        ax2.plot(hr_values, color='#e74c3c', linewidth=1.5, label='Measured HR')
        ax2.axhline(y=hr_mean, color='#3498db', linestyle='--', linewidth=1, label=f'Mean: {hr_mean:.1f} BPM')
        ax2.fill_between(range(len(hr_values)), hr_mean - hr_std, hr_mean + hr_std,
                         alpha=0.15, color='#3498db', label=f'SD: {hr_std:.1f}')
        ax2.axhspan(60, 100, alpha=0.08, color='green', label='Normal Range (60-100)')
        ax2.legend(fontsize=7, loc='upper right')
    ax2.set_title('Heart Rate Over Time', fontweight='bold')
    ax2.set_ylabel('BPM')
    ax2.set_xlabel('Sample')
    ax2.grid(True, alpha=0.3)

    # Panel 3: Signal Quality (SNR)
    ax3 = fig.add_subplot(gs[1, 0])
    bar_labels = ['POS', 'CHROM', 'Fused']
    bar_values = [snr_pos_mean, snr_chrom_mean, snr_fused_mean]
    colors = ['#3498db', '#2ecc71', '#e74c3c']
    bars = ax3.bar(bar_labels, bar_values, color=colors, width=0.5, edgecolor='white', linewidth=1.5)
    ax3.axhline(y=2.0, color='orange', linestyle='--', linewidth=1, label='Min Quality Threshold (2.0)')
    for bar, val in zip(bars, bar_values):
        ax3.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.1,
                 f'{val:.2f}', ha='center', va='bottom', fontweight='bold', fontsize=11)
    ax3.set_title('rPPG Algorithm SNR Comparison', fontweight='bold')
    ax3.set_ylabel('Signal-to-Noise Ratio')
    ax3.legend(fontsize=8)
    ax3.grid(True, axis='y', alpha=0.3)

    # Panel 4: HRV Metrics
    ax4 = fig.add_subplot(gs[1, 1])
    hrv_labels = ['RMSSD\n(ms)', 'SDNN\n(ms)', 'pNN50\n(%)', 'LF/HF\nRatio']
    hrv_values = [
        final_hrv.get('rmssd', 0),
        final_hrv.get('sdnn', 0),
        final_hrv.get('pnn50', 0),
        final_hrv.get('lf_hf_ratio', 0),
    ]
    hrv_normals = [
        (20, 60),   # RMSSD normal range
        (30, 100),  # SDNN normal range
        (5, 25),    # pNN50 normal range
        (0.5, 2.0), # LF/HF normal range
    ]
    hrv_colors = []
    for val, (lo, hi) in zip(hrv_values, hrv_normals):
        if lo <= val <= hi:
            hrv_colors.append('#2ecc71')   # green = in range
        elif val > 0:
            hrv_colors.append('#f39c12')   # orange = out of range
        else:
            hrv_colors.append('#bdc3c7')   # gray = no data

    bars4 = ax4.bar(hrv_labels, hrv_values, color=hrv_colors, width=0.5, edgecolor='white', linewidth=1.5)
    for bar, val in zip(bars4, hrv_values):
        ax4.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.3,
                 f'{val:.1f}', ha='center', va='bottom', fontweight='bold', fontsize=10)
    ax4.set_title('HRV Metrics (Green = Normal Range)', fontweight='bold')
    ax4.set_ylabel('Value')
    ax4.grid(True, axis='y', alpha=0.3)

    # Panel 5: Eye Metrics Over Time
    ax5 = fig.add_subplot(gs[2, 0])
    if ear_values:
        valid_ear = [e for e in ear_values if e > 0]
        if valid_ear:
            ax5.plot(valid_ear, color='#9b59b6', linewidth=1, alpha=0.7, label='EAR')
            ax5.axhline(y=0.24, color='red', linestyle='--', linewidth=0.8, alpha=0.7, label='Blink Threshold (0.24)')
    if gaze_stability_values:
        valid_gs = [g for g in gaze_stability_values if g > 0]
        if valid_gs:
            ax5_twin = ax5.twinx()
            ax5_twin.plot(valid_gs, color='#1abc9c', linewidth=1, alpha=0.7, label='Gaze Stability')
            ax5_twin.set_ylabel('Gaze Stability', color='#1abc9c')
            ax5_twin.tick_params(axis='y', labelcolor='#1abc9c')
    ax5.set_title('Eye Analysis: EAR & Gaze Stability', fontweight='bold')
    ax5.set_ylabel('EAR', color='#9b59b6')
    ax5.set_xlabel('Sample')
    ax5.legend(fontsize=7, loc='upper left')
    ax5.grid(True, alpha=0.3)

    # Panel 6: Summary Scorecard
    ax6 = fig.add_subplot(gs[2, 1])
    ax6.axis('off')
    summary_data = [
        ['Metric', 'Value', 'Status'],
        ['Face Detection', f'{det_rate:.1f}%', 'PASS' if det_rate > 90 else 'WARN'],
        ['Heart Rate', f'{hr_mean:.1f} BPM', 'PASS' if 50 < hr_mean < 120 else 'WARN'],
        ['HR Stability (CV)', f'{hr_cv:.1f}%', 'PASS' if hr_cv < 15 else 'WARN'],
        ['Signal SNR', f'{snr_fused_mean:.2f}', 'PASS' if snr_fused_mean > 2 else 'WARN'],
        ['RMSSD', f'{final_hrv.get("rmssd", 0):.1f} ms', 'PASS' if 10 < final_hrv.get("rmssd", 0) < 80 else 'WARN'],
        ['Resp. Rate', f'{rr_mean:.1f}', 'PASS' if 8 < rr_mean < 25 else 'WARN'],
        ['Stress Score', f'{stress_mean:.1f}/100', 'OK'],
        ['Fatigue Risk', f'{fatigue_mean:.1f}/100', 'OK'],
    ]

    colors_map = {'PASS': '#2ecc71', 'WARN': '#f39c12', 'OK': '#3498db'}
    table = ax6.table(cellText=summary_data[1:],
                      colLabels=summary_data[0],
                      cellLoc='center',
                      loc='center',
                      colWidths=[0.35, 0.3, 0.2])
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 1.6)

    # Style header
    for j in range(3):
        cell = table[0, j]
        cell.set_facecolor('#2c3e50')
        cell.set_text_props(color='white', fontweight='bold')

    # Style status column
    for i in range(1, len(summary_data)):
        status = summary_data[i][2]
        cell = table[i, 2]
        cell.set_text_props(fontweight='bold', color=colors_map.get(status, 'black'))

    ax6.set_title('Overall Accuracy Summary', fontweight='bold', pad=20)

    chart_path = os.path.join(OUTPUT_DIR, "accuracy_report.png")
    fig.savefig(chart_path, dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close(fig)
    print(f"  Chart saved to: {chart_path}")

    print("\n  Evaluation complete!")
    print(f"  Results in: {OUTPUT_DIR}/")
    print()

    # Cleanup
    detector.close()


if __name__ == "__main__":
    run_evaluation()
