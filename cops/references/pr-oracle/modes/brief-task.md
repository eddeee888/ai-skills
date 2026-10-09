# Mode: `brief-task`

Input: ask and affected files, or `PR description` for `cops:pr-sync`.

Return only applicable active rules, most relevant first, with evidence:

```text
- <rule>  (<evidence from the entry>, from you | team)
```

If none, return exactly `no relevant memory`. Never pad.
