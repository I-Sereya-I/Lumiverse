# Troubleshooting

Solutions to common issues you might encounter.

---

## Connection Issues

### "Invalid API key"

- Double-check your API key — copy it fresh from your provider's dashboard
- Make sure you're using the right key for the right provider
- API keys are per-connection — check that the correct connection is selected

### "Connection test failed"

- Verify the API URL is correct for your provider
- Check if your provider has an outage
- If using a custom endpoint, make sure the server is running and reachable
- Try the Models button — if it returns models, the connection works

### "Model not found"

- The model name must match exactly what the provider expects
- Use the Models button to see available models and copy the correct name
- Some models require specific API tiers or access approval

---

## Generation Issues

### AI responses are empty or cut off

- Check your **max tokens** setting — it might be too low
- Some models have minimum token requirements
- If using continue, the model may think the response is already complete

### AI is ignoring my instructions

- Use **Dry Run** to see what the AI actually receives
- Check that your preset blocks are enabled
- Verify macros are resolving correctly
- The instruction might be too far back in the context — try moving it closer (lower depth)

### AI is repeating itself

- Increase **frequency penalty** or **presence penalty** in sampler settings
- Lower the **temperature** slightly
- Check for duplicate content in your world book entries

### Responses are too short / too long

- Adjust **max tokens** in sampler settings
- Add explicit length instructions in your preset blocks (e.g., "Write 2-4 paragraphs")
- Use the **continue** feature if a response ends too soon

---

## World Book Issues

### Entries aren't activating

- Check that the world book is attached (to the character, persona, or global list)
- Verify keywords match what's being said in the chat (check case sensitivity)
- Use **Dry Run** to see the world info stats — it shows which entries activated and why
- Check **scan depth** — the keyword might be mentioned too far back
- Make sure the entry isn't disabled or on cooldown

### Too many entries activating

- Use **selective logic** with secondary keywords to narrow activation
- Increase **scan depth** to limit how far back keywords are checked
- Set entry **priorities** and use budget limits
- Use **groups** so only one entry from a set activates

---

## Performance Issues

### App feels slow

- Disable **glass effects** in the Theme panel (backdrop-filter can be GPU-intensive)
- Reduce the number of messages loaded per page
- Close unused panels
- Clear old chats if you have thousands

### Large world books are slow

- Consider vectorizing entries instead of relying on keyword scanning
- Use budget limits to cap the number of active entries
- Increase min priority to filter out low-importance entries

---

## Data Issues

### Lost my API keys after reinstalling

- API keys are encrypted using the `data/lumiverse.identity` file
- If you lost this file, stored keys cannot be recovered — you'll need to re-enter them
- Always back up the entire `data/` directory

### Can't log in

Reset your password from the command line:

```bash
bun run reset-password
```

---

## Productivity Surface Issues

### Quick Toolbar disappeared

- Confirm the toolbar and at least one action are enabled
- Reset the action list/order if an update removed old action IDs
- Reset only the toolbar position and size if it was dragged off-screen
- Reload Lumiverse after resetting

### Connections Picker is too large or off-screen

- Reset the picker position and size
- Reset custom section spacing and column widths
- Switch to compact density on a narrow screen
- Use the full Connection manager if the compact picker is unavailable

### Lore Indicator is too noisy

- Switch to the compact variant
- Hide metadata you do not need
- Hide or remove individual bottom-strip items
- Reduce icon size, text size, or strip spacing

### Portrait Dock is off-screen or blocks chat

- Reset its saved position and size
- Dock it left or right on desktop instead of floating
- Check the configured min/max dimensions
- On mobile, close and reopen it so drawer geometry is recalculated

### Character cards are too large, clipped, or missing details

- Reset thumbnail width and height
- Restore a standard density and footer mode
- Increase tag rows or enable the needed metadata
- If the Character tab differs from home, check whether it is sharing homepage
  settings or using overrides

### Lorebook editor panes are collapsed

- Reset the book, entry, and inspector pane widths
- Reset the half-screen editor position and size
- Close one editor if simultaneous editors are disabled

### A saved productivity setting has no visible control

The persisted settings schema may be ahead of the UI in an in-progress build.
Check the current release notes or update to a build that includes the matching
host surface. Spindle extensions cannot supply the missing internal host
integration.

---

## Getting Help

If you're stuck:

1. Check the **Diagnostics** tab in Settings for system health info
2. Use **Dry Run** to inspect what the AI sees
3. Check the World Book Diagnostics for activation issues
4. Review the browser console (F12) for frontend errors
5. Check the server logs in the terminal where Lumiverse is running
