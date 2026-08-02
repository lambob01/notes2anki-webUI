# tools

Throwaway diagnostics, kept because re-deriving them costs more than the disk.

## `provider-cors-probe.html`

Answers "can the browser call this LLM provider directly, without a backend?"
— the question the client-side direction in `PLAN.md` depends on.

```bash
cd tools && python3 -m http.server 8099
# open http://127.0.0.1:8099/provider-cors-probe.html
```

Every request carries a deliberately invalid API key, so it needs no
credentials and spends nothing. Reading an HTTP status back means CORS allowed
the call; `TypeError: Failed to fetch` means the browser blocked it.

Must be served over http(s) — opening it as a `file://` URL gives a null origin
and the results are meaningless. Results as of the last run are recorded in
`PLAN.md`; they are a property of each provider's servers and can change
without notice, so re-run rather than trusting the table.
