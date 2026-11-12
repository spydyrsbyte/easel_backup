package server

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"syscall"
	"time"

	"easel/internal/accounts"
)

const maxFetchBytes = 16 << 20

var errPrivateAddress = errors.New("private network addresses cannot be fetched")

var fetchPrivateAllowed = false

func publicAddress(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return errPrivateAddress
	}
	if fetchPrivateAllowed {
		return nil
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() || ip.IsInterfaceLocalMulticast() {
		return errPrivateAddress
	}
	if v4 := ip.To4(); v4 != nil && (v4[0] == 100 && v4[1]&0xc0 == 64 || v4[0] == 0) {
		return errPrivateAddress
	}
	return nil
}

var fetchClient = &http.Client{
	Timeout: 20 * time.Second,
	Transport: &http.Transport{
		Proxy:                 nil,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second, Control: publicAddress}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 15 * time.Second,
		MaxIdleConns:          16,
		IdleConnTimeout:       60 * time.Second,
	},
	CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		if request.URL.Scheme != "http" && request.URL.Scheme != "https" {
			return errors.New("unsupported redirect")
		}
		return nil
	},
}

func (h *handler) fetch(w http.ResponseWriter, r *http.Request) {
	if _, err := h.currentUser(r); errors.Is(err, accounts.ErrNoSession) {
		h.fail(w, r, http.StatusUnauthorized, "not signed in", nil)
		return
	} else if err != nil {
		h.fail(w, r, http.StatusInternalServerError, "internal error", err)
		return
	}
	target, err := url.Parse(r.URL.Query().Get("url"))
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" || target.User != nil {
		h.fail(w, r, http.StatusBadRequest, "an http or https address is required", nil)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		h.fail(w, r, http.StatusBadRequest, "invalid address", nil)
		return
	}
	request.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Easel")
	request.Header.Set("Accept", r.Header.Get("Accept"))
	if request.Header.Get("Accept") == "" {
		request.Header.Set("Accept", "*/*")
	}
	response, err := fetchClient.Do(request)
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, errPrivateAddress) {
			status = http.StatusForbidden
		}
		h.fail(w, r, status, "the address could not be fetched", nil)
		return
	}
	defer response.Body.Close()
	if response.ContentLength > maxFetchBytes {
		h.fail(w, r, http.StatusBadGateway, "the response is too large", nil)
		return
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxFetchBytes+1))
	if err != nil || len(body) > maxFetchBytes {
		h.fail(w, r, http.StatusBadGateway, "the response is too large or incomplete", nil)
		return
	}
	media := response.Header.Get("Content-Type")
	if media == "" {
		media = http.DetectContentType(body)
	}
	w.Header().Set("Content-Type", media)
	w.Header().Set("Content-Length", strconv.Itoa(len(body)))
	w.Header().Set("Content-Security-Policy", "sandbox; default-src 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Header().Set("X-Fetch-Status", strconv.Itoa(response.StatusCode))
	w.Header().Set("X-Fetch-URL", response.Request.URL.String())
	status := response.StatusCode
	if status < 200 || status >= 300 {
		status = http.StatusBadGateway
	}
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
