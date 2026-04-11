package syscalls

type ArgType string

const (
	TypeInt    ArgType = "int"
	TypeString ArgType = "string"
	TypePtr    ArgType = "ptr"
)

type ArgDef struct {
	Name string
	Type ArgType
}

type SyscallDef struct {
	Name        string
	Description string
	Args        []ArgDef
}
