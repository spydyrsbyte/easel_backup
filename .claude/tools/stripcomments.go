package main

import (
	"bytes"
	"flag"
	"fmt"
	"go/ast"
	"go/format"
	"go/parser"
	"go/scanner"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

var directivePrefixes = []string{"//go:", "//line ", "//export ", "//extern ", "// +build"}

func isDirective(c *ast.Comment) bool {
	for _, p := range directivePrefixes {
		if strings.HasPrefix(c.Text, p) {
			return true
		}
	}
	return false
}

func importsC(f *ast.File) bool {
	for _, imp := range f.Imports {
		if imp.Path.Value == `"C"` {
			return true
		}
	}
	return false
}

func strip(path string, src []byte) ([]byte, int, error) {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, src, parser.ParseComments)
	if err != nil {
		return nil, 0, err
	}
	if importsC(f) {
		return nil, 0, fmt.Errorf("imports \"C\"; cgo preamble must be handled manually")
	}
	removed := 0
	var kept []*ast.CommentGroup
	for _, g := range f.Comments {
		var list []*ast.Comment
		for _, c := range g.List {
			if isDirective(c) {
				list = append(list, c)
			} else {
				removed++
			}
		}
		if len(list) > 0 {
			kept = append(kept, &ast.CommentGroup{List: list})
		}
	}
	if removed == 0 {
		return src, 0, nil
	}
	f.Comments = kept
	f.Doc = nil
	ast.Inspect(f, func(n ast.Node) bool {
		switch x := n.(type) {
		case *ast.FuncDecl:
			x.Doc = nil
		case *ast.GenDecl:
			x.Doc = nil
		case *ast.ImportSpec:
			x.Doc, x.Comment = nil, nil
		case *ast.ValueSpec:
			x.Doc, x.Comment = nil, nil
		case *ast.TypeSpec:
			x.Doc, x.Comment = nil, nil
		case *ast.Field:
			x.Doc, x.Comment = nil, nil
		}
		return true
	})
	var buf bytes.Buffer
	if err := format.Node(&buf, fset, f); err != nil {
		return nil, 0, err
	}
	return buf.Bytes(), removed, nil
}

type tok struct {
	t   token.Token
	lit string
}

func tokens(src []byte) []tok {
	fset := token.NewFileSet()
	file := fset.AddFile("", fset.Base(), len(src))
	var s scanner.Scanner
	s.Init(file, src, nil, 0)
	var out []tok
	for {
		_, t, lit := s.Scan()
		if t == token.EOF {
			return out
		}
		if t == token.SEMICOLON {
			lit = ""
		}
		out = append(out, tok{t, lit})
	}
}

func sameTokens(a, b []byte) bool {
	ta, tb := tokens(a), tokens(b)
	if len(ta) != len(tb) {
		return false
	}
	for i := range ta {
		if ta[i] != tb[i] {
			return false
		}
	}
	return true
}

func main() {
	dryRun := flag.Bool("n", false, "report files with comments without writing")
	flag.Parse()
	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: go run stripcomments.go [-n] <dir>")
		os.Exit(2)
	}
	var files, total int
	failed := false
	err := filepath.WalkDir(flag.Arg(0), func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			switch d.Name() {
			case ".git", ".claude", "vendor", "bin", "testdata", "node_modules":
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") {
			return nil
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		out, removed, err := strip(path, src)
		if err != nil {
			fmt.Fprintf(os.Stderr, "SKIP %s: %v\n", path, err)
			failed = true
			return nil
		}
		if removed == 0 {
			return nil
		}
		if !sameTokens(src, out) {
			fmt.Fprintf(os.Stderr, "SKIP %s: code tokens changed, file left untouched\n", path)
			failed = true
			return nil
		}
		files++
		total += removed
		fmt.Printf("%s: %d\n", path, removed)
		if *dryRun {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		return os.WriteFile(path, out, info.Mode().Perm())
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	verb := "removed"
	if *dryRun {
		verb = "found"
	}
	fmt.Printf("%s %d comments in %d files\n", verb, total, files)
	if failed {
		os.Exit(1)
	}
}
