package server

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"easel/internal/manifest"
)

func (h *handler) providers(w http.ResponseWriter, r *http.Request) {
	names := []string{}
	for name := range h.config.Providers {
		names = append(names, name)
	}
	sort.Strings(names)
	h.write(w, 200, names)
}

func (h *handler) index(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.scryfall.com https://cards.scryfall.io; img-src 'self' data: blob: https://cards.scryfall.io; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
	h.serveBrowserFile(w, r, "templates/index.html")
}

func (h *handler) browserFile(w http.ResponseWriter, r *http.Request) {
	file, media := "", "text/javascript; charset=utf-8"
	switch r.PathValue("file") {
	case "loader.mjs":
		file = "modules/loader.mjs"
	case "runtime.mjs":
		file = "modules/runtime.mjs"
	case "session.mjs":
		file = "modules/session.mjs"
	case "shell.json":
		plan, err := h.shellDelivery()
		if err != nil {
			h.fail(w, r, http.StatusInternalServerError, "shell resources unavailable", err)
			return
		}
		h.write(w, http.StatusOK, plan)
		return
	case "style.css":
		file = "templates/css/style.css"
		media = "text/css; charset=utf-8"
	default:
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", media)
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	h.serveBrowserFile(w, r, file)
}

func (h *handler) shellDelivery() (manifest.Delivery, error) {
	root, err := os.OpenRoot(h.config.FrontendDir)
	if err != nil {
		return manifest.Delivery{}, err
	}
	defer root.Close()
	shell, err := root.OpenRoot("modules/shell")
	if err != nil {
		return manifest.Delivery{}, err
	}
	defer shell.Close()
	pkg, err := manifest.Load(shell.FS())
	if err != nil {
		return manifest.Delivery{}, err
	}
	if pkg.Manifest.Type != manifest.TypeKit {
		return manifest.Delivery{}, fmt.Errorf("shell must be a component kit")
	}
	plan := manifest.Plan{Packages: []manifest.Package{pkg}}
	delivery, err := plan.Delivery("http")
	if err != nil {
		return delivery, err
	}
	rebase := func(url string) string { return strings.Replace(url, "/assets/", "/runtime/shell/", 1) }
	resources := map[string]manifest.ClientResource{}
	for url, resource := range delivery.Resources {
		resources[rebase(url)] = resource
	}
	delivery.Resources = resources
	for i := range delivery.Packages {
		p := &delivery.Packages[i]
		p.BaseURL = rebase(p.BaseURL)
		p.LibraryEntry = rebase(p.LibraryEntry)
		for j := range p.Interfaces {
			p.Interfaces[j].URL = rebase(p.Interfaces[j].URL)
			p.Interfaces[j].Implementation = rebase(p.Interfaces[j].Implementation)
		}
	}
	return delivery, nil
}

func (h *handler) shellAsset(w http.ResponseWriter, r *http.Request) {
	plan, err := h.shellDelivery()
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "shell resources unavailable", err)
		return
	}
	resource, ok := plan.Resources[r.URL.Path]
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("ETag", `"`+resource.Hash+`"`)
	if strings.HasSuffix(r.URL.Path, ".mjs") {
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	}
	http.ServeContent(w, r, r.PathValue("file"), time.Time{}, bytes.NewReader(resource.Data))
}

func (h *handler) serveBrowserFile(w http.ResponseWriter, r *http.Request, name string) {
	root, err := os.OpenRoot(h.config.FrontendDir)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "browser resources unavailable", err)
		return
	}
	defer root.Close()
	file, err := root.Open(name)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "browser resource unavailable", err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "browser resource unavailable", err)
		return
	}
	if !info.Mode().IsRegular() {
		h.fail(w, r, http.StatusInternalServerError, "browser resource unavailable", nil)
		return
	}
	data, err := io.ReadAll(file)
	if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "browser resource unavailable", err)
		return
	}
	w.Header().Set("ETag", fmt.Sprintf(`"%x"`, sha256.Sum256(data)))
	http.ServeContent(w, r, info.Name(), time.Time{}, bytes.NewReader(data))
}
