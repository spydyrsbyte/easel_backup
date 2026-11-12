package server

import (
	"errors"
	"mime"
	"net/http"
	"strconv"
	"time"

	"easel/internal/accounts"
	"easel/internal/files"
	"easel/internal/security"
)

const fileTransferTime = 10 * time.Minute

func fileError(err error) (int, string) {
	switch {
	case errors.Is(err, files.ErrNotFound):
		return http.StatusNotFound, err.Error()
	case errors.Is(err, files.ErrTooLarge):
		return http.StatusRequestEntityTooLarge, err.Error()
	case errors.Is(err, files.ErrUnsupported), errors.Is(err, files.ErrMismatch):
		return http.StatusUnsupportedMediaType, err.Error()
	case errors.Is(err, files.ErrInvalidName):
		return http.StatusBadRequest, err.Error()
	case errors.Is(err, files.ErrConflict):
		return http.StatusConflict, err.Error()
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return http.StatusRequestEntityTooLarge, files.ErrTooLarge.Error()
	}
	return http.StatusInternalServerError, "internal error"
}

func (h *handler) fileLevel(w http.ResponseWriter, r *http.Request) (*ClientGame, accounts.User, bool) {
	user, err := h.currentUser(r)
	if err != nil {
		h.fail(w, r, http.StatusUnauthorized, "authentication required", nil)
		return nil, accounts.User{}, false
	}
	if h.config.Router != nil {
		wanted := r.PathValue("game")
		for _, level := range h.config.Router.GamesFor(r.Context(), user) {
			if level.Files == nil {
				continue
			}
			if level.ID == wanted || (level.ID == "" && wanted == "server") {
				return level, user, true
			}
		}
	}
	http.NotFound(w, r)
	return nil, accounts.User{}, false
}

func fileResponse(level *ClientGame, file files.File) map[string]any {
	id := level.ID
	if id == "" {
		id = "server"
	}
	return map[string]any{"file": map[string]any{
		"id": file.ID, "name": file.Name, "mediaType": file.MediaType, "size": file.Size, "hash": file.Hash, "owner": file.Owner,
		"version": file.Version, "url": "/files/" + id + "/" + file.ID,
	}}
}

func (h *handler) uploadFile(w http.ResponseWriter, r *http.Request) {
	level, user, ok := h.fileLevel(w, r)
	if !ok {
		return
	}
	store := level.Files
	mediaType, err := store.CleanType(r.Header.Get("Content-Type"))
	if err == nil {
		_, err = files.CleanName(r.URL.Query().Get("name"))
	}
	if err != nil {
		status, message := fileError(err)
		h.fail(w, r, status, message, err)
		return
	}
	if r.ContentLength < 0 {
		h.fail(w, r, http.StatusLengthRequired, "uploads must declare their length", nil)
		return
	}
	if r.ContentLength > store.Limit() {
		h.fail(w, r, http.StatusRequestEntityTooLarge, files.ErrTooLarge.Error(), nil)
		return
	}
	replaces := r.PathValue("file")
	version := int64(0)
	if replaces != "" {
		current, err := store.Get(r.Context(), replaces)
		if err != nil {
			status, message := fileError(err)
			h.fail(w, r, status, message, err)
			return
		}
		version = current.Version
		if match := r.Header.Get("If-Match"); match != "" && match != `"`+current.Hash+`"` {
			h.fail(w, r, http.StatusPreconditionFailed, files.ErrConflict.Error(), nil)
			return
		}
	}
	ctx := security.WithPrincipal(r.Context(), user.ID)
	fields := map[string]any{"name": r.URL.Query().Get("name"), "mediaType": mediaType, "size": r.ContentLength, "user": userFields(user)}
	if replaces != "" {
		fields["replaces"] = replaces
	}
	decision, err := level.Runtime.EvaluateUpload(ctx, fields)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "internal error", err)
		return
	}
	if !decision.Allowed {
		h.fail(w, r, http.StatusForbidden, decision.Reason, nil)
		return
	}
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(fileTransferTime))
	upload := files.Upload{Name: r.URL.Query().Get("name"), MediaType: mediaType, Owner: user.ID}
	body := http.MaxBytesReader(w, r.Body, store.Limit())
	var stored files.File
	status := http.StatusCreated
	if replaces != "" {
		status = http.StatusOK
		stored, err = store.Replace(ctx, replaces, version, body, upload)
	} else {
		stored, err = store.Put(ctx, body, upload)
	}
	if err != nil {
		status, message := fileError(err)
		h.fail(w, r, status, message, err)
		return
	}
	if err := level.Runtime.FileUploaded(ctx, stored, userFields(user)); err != nil && h.config.ReportError != nil {
		h.config.ReportError(r, err)
	}
	h.write(w, status, fileResponse(level, stored))
}

func (h *handler) downloadFile(w http.ResponseWriter, r *http.Request) {
	level, _, ok := h.fileLevel(w, r)
	if !ok {
		return
	}
	file, contents, err := level.Files.Open(r.Context(), r.PathValue("file"))
	if err != nil {
		status, message := fileError(err)
		h.fail(w, r, status, message, err)
		return
	}
	defer contents.Close()
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(fileTransferTime))
	header := w.Header()
	header.Set("ETag", `"`+file.Hash+`"`)
	header.Set("Cache-Control", "private, no-cache")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
	header.Set("Content-Type", file.MediaType)
	header.Set("Content-Length", strconv.FormatInt(file.Size, 10))
	if file.Name != "" {
		header.Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": file.Name}))
	}
	http.ServeContent(w, r, "", file.Updated, contents)
}
