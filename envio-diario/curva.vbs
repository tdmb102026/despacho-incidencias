' Llena la curva de carga con Excel (lo llama demanda.py).
' Argumentos: archivo4de4 plantilla destino textoA1 tituloGrafico
Option Explicit
Dim a, xl, w4, wc, s4, sc, i, v, n, co, h1, h2
Set a = WScript.Arguments
Set xl = CreateObject("Excel.Application")
xl.Visible = False
xl.DisplayAlerts = False
On Error Resume Next

Set w4 = xl.Workbooks.Open(a(0), 0, True)
If Err.Number <> 0 Then Fallo "no se pudo abrir el 4 de 4: " & Err.Description
Set s4 = w4.Worksheets("CECON1")
If Err.Number <> 0 Then Fallo "el 4 de 4 no tiene la hoja CECON1"

' Filas 8 a 103: de 00:15 a 00:00 del dia siguiente
h1 = Trim(s4.Cells(8, 1).Text)
h2 = Trim(s4.Cells(103, 1).Text)
If InStr(h1, "0:15") = 0 Or InStr(h2, "0:00") = 0 Then Fallo "las horas no cuadran (A8=" & h1 & ", A103=" & h2 & ")"

Set wc = xl.Workbooks.Open(a(1), 0, False)
If Err.Number <> 0 Then Fallo "no se pudo abrir la curva anterior: " & Err.Description
Set sc = wc.Worksheets(1)

n = 0
For i = 0 To 95
  v = s4.Cells(8 + i, 22).Value
  Select Case VarType(v)
    Case 2, 3, 4, 5, 6, 14
      sc.Cells(2 + i, 2).Value = CDbl(v) / 1000
      n = n + 1
  End Select
Next
If n <> 96 Then Fallo "la columna V tiene " & n & " valores numericos (deben ser 96)"

sc.Range("A1").Value = a(3)
For Each co In sc.ChartObjects
  co.Chart.HasTitle = True
  co.Chart.ChartTitle.Text = a(4)
Next
Err.Clear
wc.SaveAs a(2), wc.FileFormat
If Err.Number <> 0 Then Fallo "no se pudo guardar: " & Err.Description

WScript.Echo "OK " & n & " valores, de " & h1 & " a " & h2 & ". Maxima " & FormatNumber(xl.WorksheetFunction.Max(sc.Range("B2:B97")), 2) & " MW"
w4.Close False
wc.Close False
xl.Quit
WScript.Quit 0

Sub Fallo(m)
  On Error Resume Next
  WScript.Echo "ERROR " & m
  Err.Clear
  Dim w
  For Each w In xl.Workbooks
    w.Close False
  Next
  xl.Quit
  WScript.Quit 1
End Sub
