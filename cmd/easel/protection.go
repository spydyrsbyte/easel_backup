package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"easel/internal/seal"
)

const protectionUsage = `use: easel publisher init -name NAME -out KEYFILE
     easel publisher seal -key KEYFILE -dir FOLDER -out ARCHIVE
     easel publisher license -key KEYFILE -package ID -major N -installation KEY -licensee NAME [-expires YYYY-MM-DD] -out FILE
     easel license request
     easel license install -file FILE
     easel license list`

func licenseStore(configDir string) *seal.Store {
	return &seal.Store{Dir: filepath.Join(configDir, "licenses"), KeyFile: filepath.Join(configDir, "installation.key")}
}

func publisherCommand(_ context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("%s", protectionUsage)
	}
	flags := flag.NewFlagSet("easel publisher "+args[0], flag.ContinueOnError)
	name := flags.String("name", "", "publisher name")
	key := flags.String("key", "", "publisher key file")
	dir := flags.String("dir", "", "package folder")
	out := flags.String("out", "", "file to write")
	pkg := flags.String("package", "", "package id, such as owner.host.name")
	major := flags.Int("major", -1, "major version line the license unlocks")
	installation := flags.String("installation", "", "installation key printed by easel license request")
	licensee := flags.String("licensee", "", "who the license is issued to")
	expires := flags.String("expires", "", "last day the license works, as YYYY-MM-DD; never expires when omitted")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	switch args[0] {
	case "init":
		if err := need(flags, map[string]*string{"name": name, "out": out}); err != nil {
			return err
		}
		if _, err := os.Stat(*out); err == nil {
			return fmt.Errorf("%s already exists; a publisher key is never replaced, because packages sealed with it would stop opening", *out)
		}
		publisher, err := seal.NewPublisher(*name)
		if err != nil {
			return err
		}
		data, err := json.MarshalIndent(publisher, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(*out, append(data, '\n'), 0o600); err != nil {
			return err
		}
		return printJSON(map[string]string{"name": publisher.Name, "public": publisher.Public, "key": *out})
	case "seal":
		if err := need(flags, map[string]*string{"key": key, "dir": dir, "out": out}); err != nil {
			return err
		}
		publisher, err := seal.LoadPublisher(*key)
		if err != nil {
			return err
		}
		sealed, err := publisher.Seal(*dir, *out)
		if err != nil {
			return err
		}
		return printJSON(map[string]any{"package": sealed.ID(), "version": sealed.Manifest.Version.String(), "archive": *out, "licenseLine": sealed.Manifest.Version.Major})
	case "license":
		if err := need(flags, map[string]*string{"key": key, "package": pkg, "installation": installation, "licensee": licensee, "out": out}); err != nil {
			return err
		}
		if *major < 0 {
			return fmt.Errorf("-major is required")
		}
		publisher, err := seal.LoadPublisher(*key)
		if err != nil {
			return err
		}
		var until time.Time
		if *expires != "" {
			day, err := time.Parse("2006-01-02", *expires)
			if err != nil {
				return fmt.Errorf("-expires must be a date such as 2027-12-31")
			}
			until = day.Add(24 * time.Hour)
		}
		license, err := publisher.Issue(*pkg, *major, *installation, *licensee, until, time.Now())
		if err != nil {
			return err
		}
		data, err := json.MarshalIndent(license, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(*out, append(data, '\n'), 0o644); err != nil {
			return err
		}
		return printJSON(map[string]any{"license": *out, "package": license.Package, "major": license.Major, "licensee": license.Licensee, "expires": license.Expires})
	}
	return fmt.Errorf("%s", protectionUsage)
}

func licenseCommand(_ context.Context, args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("%s", protectionUsage)
	}
	i := newInstallation("license " + args[0])
	file := i.flags.String("file", "", "license file")
	if err := i.flags.Parse(args[1:]); err != nil {
		return err
	}
	store := licenseStore(i.configDir())
	switch args[0] {
	case "request":
		installation, err := store.Installation()
		if err != nil {
			return err
		}
		return printJSON(map[string]string{"installation": installation})
	case "install":
		if err := need(i.flags, map[string]*string{"file": file}); err != nil {
			return err
		}
		data, err := os.ReadFile(*file)
		if err != nil {
			return err
		}
		license, err := store.Install(data)
		if err != nil {
			return err
		}
		return printJSON(map[string]any{"package": license.Package, "major": license.Major, "licensee": license.Licensee, "expires": license.Expires})
	case "list":
		licenses, err := store.List()
		if err != nil {
			return err
		}
		return printJSON(licenses)
	}
	return fmt.Errorf("%s", protectionUsage)
}
