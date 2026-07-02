# Secure OTA Bootloader Threat Model

## Assets

- Firmware signing key
- Device identity key
- Flash partition table
- Anti-rollback counter
- Recovery image

## Main Abuse Cases

1. Attacker replays an older firmware with a known vulnerability.
2. Attacker modifies a valid image after download.
3. Attacker interrupts power during the swap step.
4. Attacker floods the update endpoint to drain battery.

## Mitigations

- Ed25519 signatures are verified before staging.
- Monotonic firmware versions reject rollback attempts.
- A/B flash slots preserve the previous bootable image.
- Update retries use exponential backoff and battery checks.

