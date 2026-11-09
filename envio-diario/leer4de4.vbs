' Imprime los 96 valores (kW) de la hoja CECON1, columna V, filas 8 a 103 del 4 de 4.
Option Explicit
Dim xl, w, s, i, v, n
Set xl = CreateObject("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False
On Error Resume Next
Set w = xl.Workbooks.Open(WScript.Arguments(0), 0, True)
If Err.Number <> 0 Then
  WScript.Echo "ERROR no se pudo abrir: " & Err.Description
  xl.Quit
  WScript.Quit 1
End If
Set s = w.Worksheets("CECON1")
For i = 0 To 95
  v = s.Cells(8 + i, 22).Value
  Select Case VarType(v)
    Case 2, 3, 4, 5, 6, 14
      WScript.Echo "V " & (i + 1) & " " & Replace(CStr(CDbl(v)), ",", ".")
    Case Else
      WScript.Echo "V " & (i + 1) & " -"
  End Select
Next
w.Close False
xl.Quit
WScript.Quit 0
