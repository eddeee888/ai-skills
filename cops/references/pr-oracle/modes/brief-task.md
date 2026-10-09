# Mode: `brief-task`

Input: what is about to be written—the files about to change plus the ask, such as a review thread or chosen fix option—or `PR description` for `cops:pr-sync`.

Return only remembered rules that apply to this change, most relevant first, each with its evidence:

```text
- <rule>  (<evidence from the entry>, from you | team)
```

When nothing applies, return exactly `no relevant memory`. Do not pad the brief with every known rule; a short brief gets read and a long one gets skimmed.
