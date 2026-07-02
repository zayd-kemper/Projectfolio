# FPGA Timing Report - Traffic Controller Core

## Build Target

- Board: Mojo v3 / Spartan-6 class FPGA
- Clock: 50 MHz system clock
- Inputs: vehicle loop sensors, pedestrian request, maintenance override
- Outputs: north/south and east/west signal phases, crosswalk signals, fault LED

## Timing Summary

| Path group | Requirement | Worst negative slack | Status |
| --- | ---: | ---: | --- |
| clk_50m | 20.000 ns | 3.147 ns | Pass |
| async_sync | 20.000 ns | 7.802 ns | Pass |
| pwm_status | 20.000 ns | 5.219 ns | Pass |

## Validation Notes

- Two-stage synchronizers were added on every external button and loop-sensor input.
- The pedestrian latch is cleared only after the protected walk phase completes.
- A watchdog branch moves the controller to all-red if an illegal state is detected.

