# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

Because this repo tracks issues as local markdown, a "label" is the value of the `Status:` line near the top of an issue file.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |
| —                          | `done`               | Landed. The issue is closed              |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

`done` has no counterpart on the left because **it is not a triage role.** The five above answer
*who should handle this, and how*; `done` answers *is it finished*. An issue carries one of the five
until it lands, then `done` replaces it. It is listed here because this file defines what may appear
on a `Status:` line, and leaving it out made the tracker's own vocabulary look undocumented — every
closed issue in `.scratch/` already used it.

Edit the right-hand column to match whatever vocabulary you actually use.
